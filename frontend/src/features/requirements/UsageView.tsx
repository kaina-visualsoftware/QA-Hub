import type { RequirementUsage } from "./requirements-data";

export default function UsageView({
  records, loading, error
}: { records: RequirementUsage[]; loading: boolean; error?: string }) {
  return <div className="stack">
    <p className="text-muted text-sm">
      Histórico privado e somente leitura das revisões aprovadas incluídas nos posts,
      roteiros ou diagramas. O conteúdo original dos anexos não é exposto aqui.
    </p>
    {loading && <p className="notice" role="status">Carregando histórico de geração…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!loading && !error && records.length === 0 &&
      <p className="text-muted text-sm">Ainda não existem gerações rastreadas nesta TF.</p>}
    {records.map((record) => <article key={record.id} className="requirement-row">
      <strong>{record.tipo === "post" ? "Post" :
        record.tipo === "teste" ? "Roteiro de testes" : "Diagrama"}</strong>
      <p className="text-muted text-sm">
        {new Date(record.created_at).toLocaleString("pt-BR")} ·
        {" " + record.quantidade} requisito(s) · referência {record.artefato_ref}
      </p>
      <details className="generator-context mt-3">
        <summary>Consultar revisão exata utilizada</summary>
        <div className="stack mt-3">
          {record.requisitos_snapshot.map((snapshot, index) => <article className="requirement-snapshot"
            key={snapshot.codigo + index}>
            <strong>{snapshot.codigo} · {snapshot.titulo}</strong>
            <p className="text-muted text-sm">
              Revisão usada em {snapshot.updated_at ?
                new Date(snapshot.updated_at).toLocaleString("pt-BR") : "data não registrada"}
            </p>
            <p className="text-sm mt-2">{snapshot.descricao}</p>
            {snapshot.criterios_aceite && <p className="text-sm mt-2">
              <strong>Aceite:</strong> {snapshot.criterios_aceite}
            </p>}
          </article>)}
        </div>
      </details>
    </article>)}
  </div>;
}
