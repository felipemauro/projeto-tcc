/** Casos de uso "Gerenciar Laboratórios", "Gerenciar Disciplinas" e "Gerenciar Perfis". */
import { useState } from 'react';
import { api } from '../api';
import Icone from '../components/Icone';
import { Alerta, Campo, Carregando, Modal, Pagina, Vazio, useAviso, useDados } from '../components/ui';
import { PERFIS, TIPOS_DISCIPLINA, formatarData } from '../util';

/**
 * Tela genérica de cadastro (listagem + formulário em modal).
 * campos: [{ chave, rotulo, tipo: 'text'|'number'|'select'|'email'|'password'|'textarea', opcoes, obrigatorio, lista }]
 */
function Cadastro({ titulo, subtitulo, rota, chaveId, campos, novo, colunas, transformar = (x) => x }) {
  const avisar = useAviso();
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const { dados, carregando, recarregar } = useDados(
    () => api.get(rota === '/usuarios' ? rota : `${rota}?${rota === '/laboratorios' ? 'todos' : 'todas'}=true`), []
  );
  const [edicao, setEdicao] = useState(null);
  const [erro, setErro] = useState(null);

  const abrir = (item) => { setErro(null); setEdicao(item ? { ...item, senha: '' } : { ...novo }); };
  const salvar = async (e) => {
    e.preventDefault();
    setErro(null);
    const corpo = transformar(Object.fromEntries(
      [...campos.map((c) => c.chave), 'ativo'].map((k) => [k, edicao[k]])
    ));
    if (!corpo.senha) delete corpo.senha;
    try {
      if (edicao[chaveId]) await api.put(`${rota}/${edicao[chaveId]}`, corpo);
      else await api.post(rota, corpo);
      avisar('Registro salvo.');
      setEdicao(null);
      recarregar();
    } catch (er) { setErro(er); }
  };

  const lista = (dados || []).filter((d) => mostrarInativos || d.ativo);

  return (
    <Pagina titulo={titulo} subtitulo={subtitulo}
      acoes={<button className="btn btn-primario" onClick={() => abrir(null)}><Icone nome="mais" /> Novo</button>}>
      <div className="barra-filtros">
        <label className="check"><input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos</label>
      </div>
      <div className="cartao">
        {carregando && !dados ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhum registro.</Vazio> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr>{colunas.map(([, r]) => <th key={r}>{r}</th>)}<th>Situação</th><th /></tr></thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item[chaveId]} className={item.ativo ? '' : 'linha-inativa'}>
                    {colunas.map(([fn, r]) => <td key={r}>{fn(item)}</td>)}
                    <td><span className={`tag ${item.ativo ? 'tag-ok' : ''}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="acoes-linha"><button className="btn btn-sm btn-contorno" onClick={() => abrir(item)}><Icone nome="editar" tamanho={15} /> Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edicao && (
        <Modal titulo={edicao[chaveId] ? `Editar — ${edicao.nome}` : `Novo registro`} aberto aoFechar={() => setEdicao(null)}
          rodape={<>
            <button className="btn btn-contorno" onClick={() => setEdicao(null)}>Cancelar</button>
            <button className="btn btn-primario" form="form-cadastro">Salvar</button>
          </>}>
          <form id="form-cadastro" onSubmit={salvar} className="form-grade">
            {erro && <div className="col-2"><Alerta tipo="erro">{erro.message}
              {erro.corpo?.campos && <ul>{erro.corpo.campos.map((c) => <li key={c.campo}>{c.campo}: {c.mensagem}</li>)}</ul>}
            </Alerta></div>}
            {campos.map((c) => {
              const valor = edicao[c.chave] ?? '';
              const mudar = (e) => setEdicao({ ...edicao, [c.chave]: e.target.value });
              const obrigatorio = c.obrigatorio === 'novo' ? !edicao[chaveId] : c.obrigatorio;
              return (
                <div key={c.chave} className={c.largo ? 'col-2' : ''}>
                  <Campo rotulo={`${c.rotulo}${obrigatorio ? ' *' : ''}`} ajuda={c.ajuda && c.ajuda(edicao)}>
                    {c.tipo === 'select' ? (
                      <select value={valor} onChange={mudar} required={obrigatorio}>
                        {Object.entries(c.opcoes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : c.tipo === 'textarea' ? (
                      <textarea rows={3} value={valor} onChange={mudar} required={obrigatorio} />
                    ) : (
                      <input type={c.tipo || 'text'} value={valor} onChange={mudar} required={obrigatorio} min={c.min} max={c.max} />
                    )}
                  </Campo>
                </div>
              );
            })}
            <label className="check col-2">
              <input type="checkbox" checked={edicao.ativo !== false} onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
              Ativo (registros inativos não aparecem para novas reservas)
            </label>
          </form>
        </Modal>
      )}
    </Pagina>
  );
}

export function Laboratorios() {
  return (
    <Cadastro
      titulo="Laboratórios" subtitulo="Cadastro dos laboratórios de informática disponíveis para reserva."
      rota="/laboratorios" chaveId="id_laboratorio"
      novo={{ nome: '', capacidade: 30, localizacao: '', descricao: '', ativo: true }}
      campos={[
        { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largo: true },
        { chave: 'capacidade', rotulo: 'Capacidade (lugares)', tipo: 'number', min: 1, obrigatorio: true },
        { chave: 'localizacao', rotulo: 'Localização', obrigatorio: true },
        { chave: 'descricao', rotulo: 'Recursos / descrição', tipo: 'textarea', largo: true },
      ]}
      transformar={(d) => ({ ...d, capacidade: Number(d.capacidade) })}
      colunas={[[(l) => <b>{l.nome}</b>, 'Nome'], [(l) => l.capacidade, 'Capacidade'], [(l) => l.localizacao, 'Localização'], [(l) => <span className="texto-apoio">{l.descricao}</span>, 'Recursos']]}
    />
  );
}

export function Disciplinas() {
  return (
    <Cadastro
      titulo="Disciplinas" subtitulo="A natureza da disciplina define o peso na regra de priorização."
      rota="/disciplinas" chaveId="id_disciplina"
      novo={{ nome: '', curso: 'Engenharia da Computação', periodo: 1, tipo: 'PRATICA', ativo: true }}
      campos={[
        { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largo: true },
        { chave: 'curso', rotulo: 'Curso', obrigatorio: true },
        { chave: 'periodo', rotulo: 'Período', tipo: 'number', min: 0, max: 12, obrigatorio: true, ajuda: () => 'Use 0 para atividades sem período' },
        { chave: 'tipo', rotulo: 'Natureza', tipo: 'select', opcoes: TIPOS_DISCIPLINA, obrigatorio: true, largo: true },
      ]}
      transformar={(d) => ({ ...d, periodo: Number(d.periodo) })}
      colunas={[[(d) => <b>{d.nome}</b>, 'Disciplina'], [(d) => d.curso, 'Curso'], [(d) => (d.periodo ? `${d.periodo}º` : '—'), 'Período'],
        [(d) => <span className={`tag tag-${d.tipo.toLowerCase()}`}>{TIPOS_DISCIPLINA[d.tipo]}</span>, 'Natureza']]}
    />
  );
}

export function Usuarios() {
  return (
    <Cadastro
      titulo="Usuários e perfis" subtitulo="Controle de acesso: cada perfil possui permissões específicas."
      rota="/usuarios" chaveId="id_usuario"
      novo={{ nome: '', email: '', perfil: 'DOCENTE', senha: '', ativo: true }}
      campos={[
        { chave: 'nome', rotulo: 'Nome completo', obrigatorio: true, largo: true },
        { chave: 'email', rotulo: 'E-mail institucional', tipo: 'email', obrigatorio: true },
        { chave: 'perfil', rotulo: 'Perfil', tipo: 'select', opcoes: PERFIS, obrigatorio: true },
        { chave: 'senha', rotulo: 'Senha', tipo: 'password', obrigatorio: 'novo', ajuda: (e) => (e.id_usuario ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres') },
      ]}
      colunas={[[(u) => <b>{u.nome}</b>, 'Nome'], [(u) => u.email, 'E-mail'], [(u) => <span className="tag">{PERFIS[u.perfil]}</span>, 'Perfil'], [(u) => formatarData(u.criado_em?.slice(0, 10)), 'Cadastro']]}
    />
  );
}
