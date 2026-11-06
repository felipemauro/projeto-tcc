/** Cliente HTTP da API REST (JSON + token JWT). */
const BASE = import.meta.env.VITE_API_URL || '/api';
const CHAVE_TOKEN = 'sal.token';

export const sessao = {
  token: () => localStorage.getItem(CHAVE_TOKEN),
  salvar: (t) => localStorage.setItem(CHAVE_TOKEN, t),
  limpar: () => localStorage.removeItem(CHAVE_TOKEN),
};

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || 'Falha na comunicação com o servidor.');
    this.status = status;
    this.corpo = corpo || {};
  }
}

async function requisitar(metodo, caminho, corpo) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  const token = sessao.token();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, { erro: 'Servidor indisponível. Verifique sua conexão.' });
  }

  if (resposta.status === 401 && token) {
    sessao.limpar();
    window.dispatchEvent(new Event('sal:sessao-expirada'));
  }
  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json() : await resposta.text();
  if (!resposta.ok) throw new ErroApi(resposta.status, typeof dados === 'object' ? dados : { erro: dados });
  return dados;
}

export const api = {
  get: (c) => requisitar('GET', c),
  post: (c, b) => requisitar('POST', c, b ?? {}),
  put: (c, b) => requisitar('PUT', c, b),
  patch: (c, b) => requisitar('PATCH', c, b),
  delete: (c) => requisitar('DELETE', c),
  /** Download de arquivo (CSV) autenticado. */
  async baixar(caminho, nomeArquivo) {
    const r = await fetch(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${sessao.token()}` } });
    if (!r.ok) throw new ErroApi(r.status, await r.json().catch(() => ({})));
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
    a.click();
    URL.revokeObjectURL(url);
  },
  urlEventos: () => `${BASE}/eventos?token=${encodeURIComponent(sessao.token() || '')}`,
};

/** Monta query string ignorando valores vazios. */
export function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}
