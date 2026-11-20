import { Icon } from '../components/Icon';
import { Empty } from '../components/ui';
import type { Incident } from '../domain/incidents';
import type { ProblemCluster } from '../domain/operations';
export function ProblemClusters({clusters,items,onOpen}:{clusters:ProblemCluster[];items:Incident[];onOpen:(id:string)=>void}) {
 return <><header className="page-heading secondary-heading"><div><h1>Массовые сбои</h1><p>Возможные связи между активными инцидентами</p></div><span className="small-tag tone-purple">{clusters.length} групп</span></header><p className="cluster-disclaimer">Совпадения по сервисам и симптомам — гипотезы для проверки координатором. Общая причина ещё не установлена.</p><div className="problem-clusters">{clusters.map(cluster=><section key={cluster.id} className="problem-cluster surface"><h3><Icon name="layers" size={18}/> {cluster.title}</h3><p>{cluster.reason} · {cluster.incidentIds.length} инцидента</p><div>{cluster.sysIds.map((id,index)=><button className="cluster-incident" key={id} onClick={()=>onOpen(id)}><strong>{cluster.incidentIds[index]}</strong><span>{items.find(i=>i.sysId===id)?.header}</span><Icon name="right" size={15}/></button>)}</div></section>)}</div>{!clusters.length&&<Empty icon="layers" title="Связанные инциденты не обнаружены">При появлении похожих активных инцидентов они будут показаны здесь автоматически.</Empty>}</>;
}
