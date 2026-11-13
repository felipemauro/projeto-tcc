import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import Icone from '../components/Icone';
import { Alerta, Campo, Cartao, Pagina, Vazio, useAviso } from '../components/ui';
import { formatarData, formatarDataHora, hojeISO, somarDias } from '../util';

export default function Relatorios() {
  const avisar = useAviso();
  const [tipos, setTipos] = useState({});
  const [f, setF] = useState({ tipo: 'ocupacao', inicio: somarDias(hojeISO(), -30), fim: hojeISO() });
  const [resultado, setResultado] = useState(null);
  const [gerados, setGerados] = useState([]);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);

  const carregarGerados = () => api.get('/relatorios/gerados').then(setGerados).catch(() => {});
  useEffect(() => { api.get('/relatorios/tipos').then(setTipos); carregarGerados(); }, []);

  const gerar = async (e) => {
    e?.preventDefault();
    setErro(''); setGerando(true);
    try {
      setResultado(await api.get(`/relatorios${qs(f)}`));
      carregarGerados();
    } catch (er) { setErro(er.message); } finally { setGerando(false); }
  };

  const baixar = async () => {
    try {
      await api.baixar(`/relatorios${qs({ ...f, formato: 'csv' })}`, `relatorio-${f.tipo}-${f.inicio}_${f.fim}.csv`);
      avisar('Arquivo CSV gerado.');
      carregarGerados();
    } catch (er) { setErro(er.message); }
  };

  const formatarCelula = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(v).replace('.', ',') : v);

  return (
    <Pagina titulo="Relatórios" subtitulo="Relatórios de utilização para apoio à tomada de decisão.">
      <Cartao>
        <form className="form-linha" onSubmit={gerar}>
          <Campo rotulo="Tipo de relatório">
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo rotulo="De"><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} required /></Campo>
          <Campo rotulo="Até"><input type="date" value={f.fim} min={f.inicio} onChange={(e) => setF({ ...f, fim: e.target.value })} required /></Campo>
          <div className="form-linha-acoes">
            <button className="btn btn-primario" disabled={gerando}><Icone nome="relatorio" /> {gerando ? 'Gerando…' : 'Gerar'}</button>
            <button type="button" className="btn btn-contorno" onClick={baixar}><Icone nome="download" /> Exportar CSV</button>
          </div>
        </form>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
      </Cartao>

      {resultado && (
        <Cartao titulo={`${resultado.titulo} — ${formatarData(resultado.periodo.inicio)} a ${formatarData(resultado.periodo.fim)}`}
          acoes={<span className="texto-apoio">{resultado.linhas.length} registro(s)</span>}>
          {resultado.linhas.length === 0 ? <Vazio>Nenhum dado no período selecionado.</Vazio> : (
            <div className="tabela-rolagem">
              <table className="tabela tabela-compacta">
                <thead><tr>{resultado.colunas.map((c) => <th key={c.chave}>{c.rotulo}</th>)}</tr></thead>
                <tbody>
                  {resultado.linhas.map((l, i) => (
                    <tr key={i}>{resultado.colunas.map((c) => <td key={c.chave}>{formatarCelula(l[c.chave])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      )}

      <Cartao titulo="Relatórios gerados recentemente">
        {gerados.length === 0 ? <p className="texto-apoio">Nenhum relatório gerado ainda.</p> : (
          <table className="tabela tabela-compacta">
            <thead><tr><th>Data</th><th>Tipo</th><th>Período</th><th>Usuário</th></tr></thead>
            <tbody>
              {gerados.slice(0, 10).map((g) => (
                <tr key={g.id_relatorio}>
                  <td>{formatarDataHora(g.data_geracao)}</td><td>{tipos[g.tipo] || g.tipo}</td>
                  <td>{formatarData(g.parametros?.inicio)} a {formatarData(g.parametros?.fim)}</td>
                  <td>{g.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </Pagina>
  );
}
