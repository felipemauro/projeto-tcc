import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alerta, Campo, Cartao, Carregando, Pagina, useAviso } from '../components/ui';
import { DIAS, PERFIS, TIPOS_DISCIPLINA } from '../util';

/** Ajuste dos critérios de priorização definidos pela instituição. */
export default function Regras() {
  const avisar = useAviso();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { api.get('/parametros').then(setP); }, []);
  if (!p) return <Pagina titulo="Regras de priorização"><Carregando /></Pagina>;

  const setPeso = (grupo, chave) => (e) => setP({ ...p, pesos: { ...p.pesos, [grupo]: { ...p.pesos[grupo], [chave]: Number(e.target.value) } } });
  const setRaiz = (grupo, chave, conv = (v) => v) => (e) => setP({ ...p, [grupo]: { ...p[grupo], [chave]: conv(e.target.value) } });
  const alternarDia = (d) => {
    const dias = p.funcionamento.diasSemana.includes(d) ? p.funcionamento.diasSemana.filter((x) => x !== d) : [...p.funcionamento.diasSemana, d].sort();
    setP({ ...p, funcionamento: { ...p.funcionamento, diasSemana: dias } });
  };
  const alternarAuto = (perfil) => setP({
    ...p,
    aprovacaoAutomatica: p.aprovacaoAutomatica.includes(perfil) ? p.aprovacaoAutomatica.filter((x) => x !== perfil) : [...p.aprovacaoAutomatica, perfil],
  });

  const maximo = Math.max(...Object.values(p.pesos.natureza)) + p.pesos.proximidadeMax + p.pesos.ocupacaoMax + Math.max(...Object.values(p.pesos.perfil));

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    try { setP(await api.put('/parametros', p)); avisar('Regras atualizadas. Novas solicitações já usam os novos pesos.'); }
    catch (er) { setErro(er.corpo?.campos?.map((c) => `${c.campo}: ${c.mensagem}`).join('; ') || er.message); }
  };

  const num = (valor, onChange) => <input type="number" min="0" max="100" value={valor} onChange={onChange} />;

  return (
    <Pagina titulo="Regras de priorização" subtitulo="Critérios usados pelo sistema para calcular a prioridade (0 a 100) de cada solicitação.">
      <form onSubmit={salvar}>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <div className="layout-painel">
          <Cartao titulo="Peso pela natureza da disciplina">
            <div className="form-grade">
              {Object.entries(TIPOS_DISCIPLINA).map(([k, v]) => <Campo key={k} rotulo={v}>{num(p.pesos.natureza[k], setPeso('natureza', k))}</Campo>)}
              <Campo rotulo="Sem disciplina (reuniões etc.)">{num(p.pesos.natureza.SEM_DISCIPLINA, setPeso('natureza', 'SEM_DISCIPLINA'))}</Campo>
            </div>
          </Cartao>
          <Cartao titulo="Peso pelo perfil do solicitante">
            <div className="form-grade">
              {Object.entries(PERFIS).map(([k, v]) => <Campo key={k} rotulo={v}>{num(p.pesos.perfil[k], setPeso('perfil', k))}</Campo>)}
            </div>
          </Cartao>
          <Cartao titulo="Demais critérios">
            <div className="form-grade">
              <Campo rotulo="Proximidade da data (máximo)" ajuda="Até 2 dias: 100% · até 7: 70% · até 14: 40% · depois: 15%">
                {num(p.pesos.proximidadeMax, (e) => setP({ ...p, pesos: { ...p.pesos, proximidadeMax: Number(e.target.value) } }))}
              </Campo>
              <Campo rotulo="Ocupação do laboratório (máximo)" ajuda="Proporcional a alunos ÷ capacidade">
                {num(p.pesos.ocupacaoMax, (e) => setP({ ...p, pesos: { ...p.pesos, ocupacaoMax: Number(e.target.value) } }))}
              </Campo>
            </div>
            <Alerta tipo={maximo > 100 ? 'aviso' : 'info'}>
              Pontuação máxima possível: <b>{maximo}</b>{maximo > 100 && ' (valores acima de 100 são limitados a 100)'}.
            </Alerta>
          </Cartao>
          <Cartao titulo="Funcionamento e aprovação">
            <div className="form-grade">
              <Campo rotulo="Abertura"><input type="time" value={p.funcionamento.inicio} onChange={setRaiz('funcionamento', 'inicio')} /></Campo>
              <Campo rotulo="Fechamento"><input type="time" value={p.funcionamento.fim} onChange={setRaiz('funcionamento', 'fim')} /></Campo>
              <div className="col-2">
                <span className="campo-rotulo">Dias de funcionamento</span>
                <div className="horarios-rapidos">
                  {DIAS.map((d, i) => <button type="button" key={d} className={`chip ${p.funcionamento.diasSemana.includes(i) ? 'ativo' : ''}`} onClick={() => alternarDia(i)}>{d}</button>)}
                </div>
              </div>
              <div className="col-2">
                <span className="campo-rotulo">Aprovação automática (quando não há conflitos)</span>
                <div className="horarios-rapidos">
                  {Object.entries(PERFIS).map(([k, v]) => <button type="button" key={k} className={`chip ${p.aprovacaoAutomatica.includes(k) ? 'ativo' : ''}`} onClick={() => alternarAuto(k)}>{v}</button>)}
                </div>
              </div>
              <Campo rotulo="Sugestões: janela de dias">
                <input type="number" min="1" max="30" value={p.sugestoes.janelaDias} onChange={setRaiz('sugestoes', 'janelaDias', Number)} />
              </Campo>
              <Campo rotulo="Sugestões: quantidade máxima">
                <input type="number" min="1" max="20" value={p.sugestoes.maximo} onChange={setRaiz('sugestoes', 'maximo', Number)} />
              </Campo>
            </div>
          </Cartao>
        </div>
        <div className="acoes-form"><button className="btn btn-primario">Salvar regras</button></div>
      </form>
    </Pagina>
  );
}
