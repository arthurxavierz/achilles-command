import { requireInternalAuth, authError } from '../lib/auth.mjs';
const USER_AGENT = "AchillesCommand/1.0 (+https://achillesmedia.com.br)";

const categoryRules = [
  // Regras específicas vêm antes das genéricas para buscas como
  // "clínicas odontológicas" ou "clínicas veterinárias".
  { test: /odont|dent/i, filters: [['amenity','dentist'],['healthcare','dentist']] },
  { test: /veterin/i, filters: [['amenity','veterinary'],['healthcare','veterinary']] },
  { test: /fisioter|f[ií]sio/i, filters: [['healthcare','physiotherapist']] },
  { test: /psic[oó]log|psicoter/i, filters: [['healthcare','psychotherapist|psychologist']] },
  { test: /laborat[oó]ri|an[aá]lise/i, filters: [['healthcare','laboratory'],['amenity','clinic']] },
  { test: /cl[ií]nic|m[eé]dic|consult[oó]ri|sa[uú]de/i, filters: [['amenity','clinic|doctors'],['healthcare','clinic|doctor']] },
  { test: /advog|jur[ií]dic|escrit[oó]rio de advoc/i, filters: [['office','lawyer']] },
  { test: /contab|contador/i, filters: [['office','accountant']] },
  { test: /imobili|corretor/i, filters: [['office','estate_agent']] },
  { test: /academ|crossfit|fitness/i, filters: [['leisure','fitness_centre'],['leisure','sports_centre']] },
  { test: /farm[aá]c|drogari/i, filters: [['amenity','pharmacy']] },
  { test: /pet\s?shop/i, filters: [['shop','pet']] },
  { test: /pizz/i, filters: [['amenity','restaurant'],['cuisine','pizza']] },
  { test: /restaurante|lanchonete/i, filters: [['amenity','restaurant|fast_food']] },
  { test: /caf[eé]|cafeter/i, filters: [['amenity','cafe']] },
  { test: /hotel|pousada/i, filters: [['tourism','hotel|guest_house']] },
  { test: /sal[aã]o|cabeleireir|barbear|est[eé]tic/i, filters: [['shop','hairdresser|beauty']] },
  { test: /loja.*roup|moda|vestu[aá]r/i, filters: [['shop','clothes|fashion']] },
  { test: /auto.*escola/i, filters: [['amenity','driving_school']] },
  { test: /oficina|mec[aâ]nic/i, filters: [['shop','car_repair']] },
  { test: /concession[aá]ria|ve[ií]cul/i, filters: [['shop','car']] },
  { test: /escola|col[eé]gio/i, filters: [['amenity','school']] },
  { test: /curso|treinamento/i, filters: [['office','educational_institution'],['amenity','training']] },
];

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const cleanPhone = (v='') => String(v).replace(/[^\d+]/g,'').replace(/^00/,'+');
const first = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function categoryLabel(tags={}) {
  const raw = first(tags.amenity, tags.healthcare, tags.shop, tags.office, tags.tourism, tags.leisure, tags.craft);
  const labels = {
    clinic:'Clínica', doctors:'Consultório médico', dentist:'Odontologia', lawyer:'Advocacia', accountant:'Contabilidade',
    estate_agent:'Imobiliária', fitness_centre:'Academia', sports_centre:'Centro esportivo', pharmacy:'Farmácia', veterinary:'Veterinária',
    pet:'Pet shop', restaurant:'Restaurante', cafe:'Cafeteria', hotel:'Hotel', guest_house:'Pousada', hairdresser:'Salão/Barbearia',
    beauty:'Beleza', clothes:'Moda', car_repair:'Oficina', car:'Veículos', school:'Escola', training:'Treinamento'
  };
  return labels[raw] || (raw ? String(raw).replace(/_/g,' ') : 'Empresa local');
}

function addressFrom(tags={}) {
  if (tags['addr:full']) return tags['addr:full'];
  const street = first(tags['addr:street'], tags['addr:place']);
  const number = tags['addr:housenumber'] || '';
  const district = first(tags['addr:suburb'], tags['addr:neighbourhood']);
  const city = first(tags['addr:city'], tags['addr:municipality']);
  return [street && `${street}${number ? `, ${number}` : ''}`, district, city].filter(Boolean).join(' - ');
}

function scoreProspect(p) {
  let score = 20;
  const reasons = [];
  if (p.phone) { score += 24; reasons.push('telefone disponível'); }
  else reasons.push('sem telefone público');
  if (p.email) { score += 8; reasons.push('e-mail disponível'); }
  if (p.whatsapp) { score += 8; reasons.push('WhatsApp identificado'); }
  if (!p.website) { score += 24; reasons.push('sem site identificado'); }
  else { score += 5; reasons.push('site identificado'); }
  if (!p.instagram && !p.facebook) { score += 10; reasons.push('presença social limitada'); }
  if (p.address) score += 4;
  if (p.name && p.name.length > 3) score += 2;
  score = Math.max(0, Math.min(100, score));
  const band = score >= 75 ? 'Alta' : score >= 55 ? 'Média' : 'Baixa';
  return { score, band, reasons };
}

function buildFilters(query) {
  const rule = categoryRules.find(r => r.test.test(query));
  if (rule) return rule.filters;
  const term = norm(query).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2).slice(0,3).join('|');
  return term ? [['name', term]] : [['name', '.']];
}

async function geocode(city, state) {
  const q = [city, state, 'Brasil'].filter(Boolean).join(', ');
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9' } });
  if (!res.ok) throw new Error(`Falha ao localizar a cidade (${res.status})`);
  const data = await res.json();
  if (!data?.length) throw new Error('Cidade não encontrada. Informe cidade e UF.');
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), display: data[0].display_name };
}

async function overpassSearch({ query, lat, lon, radiusKm, limit }) {
  const filters = buildFilters(query);
  const radius = Math.max(1000, Math.min(Number(radiusKm || 15) * 1000, 50000));
  const parts = filters.map(([key,value]) => `nwr(around:${radius},${lat},${lon})["${key}"~"${value}",i];`).join('\n');
  const overpass = `[out:json][timeout:22];(\n${parts}\n);out center ${Math.max(limit*3,60)};`;
  const endpoints = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: overpass })
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Fonte pública indisponível');
}

function mapElement(el, origin) {
  const t = el.tags || {};
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!t.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const phone = cleanPhone(first(t['contact:phone'], t.phone, t['contact:mobile'], t.mobile));
  const whatsapp = cleanPhone(first(t['contact:whatsapp'], t.whatsapp));
  const website = first(t['contact:website'], t.website, t.url);
  const email = first(t['contact:email'], t.email);
  const instagram = first(t['contact:instagram'], t.instagram);
  const facebook = first(t['contact:facebook'], t.facebook);
  const p = {
    id: `osm_${el.type}_${el.id}`,
    source: 'OpenStreetMap', sourceId: String(el.id),
    name: t.name, category: categoryLabel(t), address: addressFrom(t),
    phone, whatsapp, website, email, instagram, facebook,
    latitude: lat, longitude: lon,
    distanceKm: Number(haversine(origin.lat, origin.lon, lat, lon).toFixed(1)),
    mapUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    googleUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.name} ${addressFrom(t)}`)}`,
    rawTags: t
  };
  return { ...p, ...scoreProspect(p) };
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);
  try {
    const body = await request.json();
    const query = String(body.query || '').trim();
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim().toUpperCase();
    const radiusKm = Math.max(2, Math.min(Number(body.radiusKm || 15), 50));
    const limit = Math.max(5, Math.min(Number(body.limit || 30), 60));
    if (!query || !city) return json({ error: 'Informe o segmento e a cidade.' }, 400);

    const origin = await geocode(city, state);
    const elements = await overpassSearch({ query, lat: origin.lat, lon: origin.lon, radiusKm, limit });
    const seen = new Set();
    const results = elements.map(el => mapElement(el, origin)).filter(Boolean)
      .filter(p => {
        const key = norm(`${p.name}|${p.address}|${p.phone}`);
        if (seen.has(key)) return false; seen.add(key); return true;
      })
      .filter(p => p.distanceKm <= radiusKm + 0.5)
      .sort((a,b) => b.score - a.score || a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return json({
      engine: 'achilles-native-osm',
      query, city, state, radiusKm,
      origin: { lat: origin.lat, lon: origin.lon, label: origin.display },
      count: results.length,
      results,
      note: 'Busca nativa sem API paga. Dados públicos do OpenStreetMap; cobertura varia conforme a região.'
    });
  } catch (error) {
    return json({ error: error.message || 'Falha na busca de empresas' }, 502);
  }
};
