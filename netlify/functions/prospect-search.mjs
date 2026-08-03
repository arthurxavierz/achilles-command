import { requireInternalAuth, authError } from '../lib/auth.mjs';

const USER_AGENT = 'AchillesCommand/1.1 (+https://achillesmedia.com.br)';
const GOOGLE_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'nextPageToken'
].join(',');

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' }
});

const first = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
const cleanPhone = (v = '') => String(v).replace(/[^\d+]/g, '').replace(/^00/, '+');
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n)));

function env(name) {
  try { return Netlify.env.get(name); } catch { return process.env[name]; }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeCity(city, state) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', [city, state, 'Brasil'].filter(Boolean).join(', '));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function categoryLabel(place = {}) {
  return first(place.primaryTypeDisplayName?.text, place.primaryType, place.types?.[0], 'Empresa local')
    .toString()
    .replace(/_/g, ' ');
}

function categoryAutomationWeight(category = '', types = []) {
  const text = `${category} ${(types || []).join(' ')}`.toLowerCase();
  if (/clinic|doctor|dent|hospital|health|veterinar|physio|psych|beauty|spa|gym|fitness|restaurant|food|real_estate|car_dealer|lawyer|account|school|hotel|lodging/.test(text)) return 18;
  if (/store|shop|pharmacy|insurance|finance|travel|repair|service/.test(text)) return 12;
  return 7;
}

function scoreProspect(p) {
  const reviews = Number(p.userRatingCount || 0);
  const rating = Number(p.rating || 0);

  // Potencial para SITE: ausência de site pesa mais; reputação/atividade reforça o valor comercial do lead.
  let siteScore = p.website ? 28 : 82;
  if (reviews >= 25) siteScore += 5;
  if (reviews >= 100) siteScore += 5;
  if (reviews >= 300) siteScore += 4;
  if (rating >= 4.3) siteScore += 3;
  siteScore = clamp(siteScore, 0, 100);

  // Potencial para POSICIONAMENTO DIGITAL: negócios já validados pelo público, mas com espaço de presença própria, sobem.
  let digitalScore = 42;
  if (!p.website) digitalScore += 18;
  else digitalScore += 6;
  if (reviews >= 10) digitalScore += 8;
  if (reviews >= 50) digitalScore += 8;
  if (reviews >= 200) digitalScore += 7;
  if (rating >= 4.0) digitalScore += 5;
  if (rating >= 4.6) digitalScore += 4;
  digitalScore = clamp(digitalScore, 0, 100);

  // Potencial para AUTOMAÇÃO/IA é uma estimativa de fit operacional, não uma afirmação sobre processos internos.
  let automationScore = 34 + categoryAutomationWeight(p.category, p.types);
  if (p.phone) automationScore += 8;
  if (reviews >= 30) automationScore += 8;
  if (reviews >= 150) automationScore += 7;
  if (reviews >= 500) automationScore += 5;
  automationScore = clamp(automationScore, 0, 100);

  const services = [
    { key: 'site', label: 'Site', score: siteScore },
    { key: 'digital', label: 'Posicionamento digital', score: digitalScore },
    { key: 'automation', label: 'Automação / IA', score: automationScore }
  ].sort((a, b) => b.score - a.score);

  let score = Math.round(services[0].score * 0.62 + services[1].score * 0.23 + services[2].score * 0.15);
  if (p.phone) score += 5;
  if (!p.phone) score -= 8;
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') score -= 15;
  score = clamp(score, 0, 100);

  const reasons = [];
  if (!p.website) reasons.push('sem site identificado');
  else reasons.push('site identificado');
  if (p.phone) reasons.push('telefone disponível');
  else reasons.push('telefone não publicado');
  if (reviews > 0) reasons.push(`${reviews.toLocaleString('pt-BR')} avaliações no Google`);
  if (rating > 0) reasons.push(`nota ${rating.toFixed(1)} no Google`);

  const band = score >= 85 ? 'Muito alta' : score >= 70 ? 'Alta' : score >= 50 ? 'Média' : 'Baixa';
  return {
    score,
    band,
    reasons,
    siteScore,
    digitalScore,
    automationScore,
    recommendedService: services[0].label
  };
}

function mapPlace(place, origin) {
  const lat = Number(place.location?.latitude);
  const lon = Number(place.location?.longitude);
  const name = place.displayName?.text || '';
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const phone = cleanPhone(first(place.internationalPhoneNumber, place.nationalPhoneNumber));
  const p = {
    id: `gplace_${place.id}`,
    source: 'Google Places',
    sourceId: place.id,
    name,
    category: categoryLabel(place),
    address: place.formattedAddress || '',
    phone,
    whatsapp: '',
    email: '',
    website: place.websiteUri || '',
    instagram: '',
    facebook: '',
    latitude: lat,
    longitude: lon,
    distanceKm: origin ? Number(haversine(origin.lat, origin.lon, lat, lon).toFixed(1)) : null,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(place.id)}`,
    googleUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(place.id)}`,
    rating: Number(place.rating || 0),
    userRatingCount: Number(place.userRatingCount || 0),
    businessStatus: place.businessStatus || '',
    types: place.types || []
  };

  return { ...p, ...scoreProspect(p) };
}

async function googleTextSearch({ query, city, state, radiusKm, limit, origin, apiKey }) {
  const results = [];
  let pageToken = '';
  let calls = 0;
  const maxPages = Math.min(3, Math.ceil(limit / 20));

  for (let page = 0; page < maxPages && results.length < limit; page++) {
    const pageSize = Math.min(20, limit - results.length);
    const body = {
      textQuery: origin ? query : `${query} em ${city}${state ? `, ${state}` : ''}, Brasil`,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize,
    };

    if (origin) {
      body.locationBias = {
        circle: {
          center: { latitude: origin.lat, longitude: origin.lon },
          radius: Math.min(50000, Math.max(1000, Number(radiusKm || 20) * 1000))
        }
      };
    }
    if (pageToken) body.pageToken = pageToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(GOOGLE_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK
        },
        body: JSON.stringify(body)
      });
    } finally {
      clearTimeout(timer);
    }

    calls++;
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!res.ok) {
      const message = data?.error?.message || `Google Places respondeu ${res.status}`;
      throw new Error(message);
    }

    results.push(...(data.places || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }

  return { places: results, calls };
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);

  try {
    const apiKey = env('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return json({
      error: 'Google Places ainda não configurado. Cadastre GOOGLE_PLACES_API_KEY no Netlify e faça um novo deploy.'
    }, 503);

    const body = await request.json();
    const query = String(body.query || '').trim();
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim().toUpperCase();
    const radiusKm = clamp(body.radiusKm || 20, 2, 50);
    const limit = clamp(body.limit || 30, 5, 60);
    if (!query || !city) return json({ error: 'Informe o segmento e a cidade.' }, 400);

    const origin = await geocodeCity(city, state);
    const { places, calls } = await googleTextSearch({ query, city, state, radiusKm, limit, origin, apiKey });

    const seen = new Set();
    let results = places
      .map(place => mapPlace(place, origin))
      .filter(Boolean)
      .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY')
      .filter(p => {
        if (seen.has(p.sourceId)) return false;
        seen.add(p.sourceId);
        return true;
      });

    // Quando conseguimos o centro da cidade, respeitamos o raio escolhido no resultado final.
    if (origin) results = results.filter(p => p.distanceKm == null || p.distanceKm <= radiusKm + 1);

    results = results
      .sort((a, b) => b.score - a.score || b.userRatingCount - a.userRatingCount)
      .slice(0, limit);

    return json({
      engine: 'google-places-new',
      query,
      city,
      state,
      radiusKm,
      origin: origin || (results[0] ? { lat: results[0].latitude, lon: results[0].longitude, label: `${city}, ${state}` } : null),
      count: results.length,
      apiCalls: calls,
      results,
      note: 'Dados comerciais obtidos pela Places API (New). Score Achilles é uma estimativa comercial baseada apenas nos sinais retornados pela busca.'
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'A consulta ao Google Places demorou demais. Tente novamente.'
      : (error?.message || 'Falha na busca de empresas');
    return json({ error: message }, 502);
  }
};
