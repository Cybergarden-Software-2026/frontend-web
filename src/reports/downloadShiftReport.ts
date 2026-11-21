import type { ShiftStatistics } from '../domain/shiftStatistics.ts';
import type { ReportContext } from './shiftReportModel.ts';
export async function downloadShiftReport(format:'pdf'|'xlsx',stats:ShiftStatistics,context:ReportContext){
 const {createShiftPdf,createShiftXlsx}=await import('./shiftReportFiles.ts');
 let bytes:Uint8Array;
 if(format==='pdf'){
  async function font(name:string){const response=await fetch(import.meta.env.BASE_URL+'fonts/report/'+name+'.ttf');if(!response.ok)throw new Error('Не удалось загрузить шрифт отчёта. Повторите скачивание.');return new Uint8Array(await response.arrayBuffer());}
  const [regular,bold]=await Promise.all([font('MTSText-Regular'),font('MTSText-Bold')]);bytes=await createShiftPdf(stats,context,{regular,bold});
 }else bytes=await createShiftXlsx(stats,context);
 const blob=new Blob([new Uint8Array(bytes)],{type:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=`UnderCtrl_${context.personal?.source==='demo'?'DEMO_':''}${new Date(stats.start+3*3600_000).toISOString().slice(0,16).replace(/:/g,'-')}_${new Date(stats.end+3*3600_000).toISOString().slice(0,16).replace(/:/g,'-')}.${format}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
