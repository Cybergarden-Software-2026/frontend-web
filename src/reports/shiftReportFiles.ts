import type { ShiftStatistics } from '../domain/shiftStatistics.ts';
import type { ReportContext,ReportValue } from './shiftReportModel.ts';
import { reportDate,shiftReportSections } from './shiftReportModel.ts';

function bytesToBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export async function createShiftPdf(stats:ShiftStatistics,context:ReportContext,fonts:{regular:Uint8Array;bold:Uint8Array}):Promise<Uint8Array>{
 const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 const demo=context.personal?.source==='demo';
 const personal=context.personalAccount===true;
 doc.addFileToVFS('MTSText-Regular.ttf',bytesToBase64(fonts.regular));doc.addFont('MTSText-Regular.ttf','MTSText','normal');
 doc.addFileToVFS('MTSText-Bold.ttf',bytesToBase64(fonts.bold));doc.addFont('MTSText-Bold.ttf','MTSText','bold');
 doc.setProperties({title:demo?'ДЕМО · UnderCtrl — личная статистика':personal?'UnderCtrl — личная статистика':'UnderCtrl — работа координаторов за период',subject:reportDate(stats.start)+' — '+reportDate(stats.end),creator:'UnderCtrl'});
 const sections=shiftReportSections(stats,context);
 for(const [index,section] of sections.entries()){
  if(index)doc.addPage();
  doc.setFont('MTSText','bold');doc.setTextColor('#231E32');doc.setFontSize(18);doc.text('UnderCtrl · '+section.title,14,17);
  doc.setFont('MTSText','normal');doc.setTextColor('#625B71');doc.setFontSize(9);doc.text(reportDate(stats.start)+' — '+reportDate(stats.end),14,24);
  if(demo){doc.setTextColor('#79501B');doc.text('Демонстрационные личные показатели · Тестовый аккаунт',14,30);}
  else if(!index&&personal){doc.text('Личные показатели по журналу назначений',14,30);}
  else if(!index){doc.setTextColor(context.historyIncomplete||!context.connected?'#79501B':'#625B71');doc.text(context.historyIncomplete?'История неполная. Подробности на листе «Методика».':!context.connected?'Использованы последние загруженные данные.':'Показатели по снимку и доступной истории изменений.',14,30);}
  autoTable(doc,{startY:demo?36:index?30:35,margin:{top:14,right:14,bottom:18,left:14},head:[section.columns.map(c=>c.label)],body:section.rows.length?section.rows.map(row=>row.map((value,column)=>printValue(value,section.columns[column].format))):[['Нет данных за выбранный период',...section.columns.slice(1).map(()=> '—')]],styles:{font:'MTSText',fontStyle:'normal',fontSize:8,cellPadding:index===0?1.3:2.5,overflow:'linebreak',textColor:'#231E32',lineColor:'#E7E0EF',lineWidth:.15},headStyles:{font:'MTSText',fontStyle:'bold',fillColor:'#5D419D',textColor:'#FFFFFF'},alternateRowStyles:{fillColor:'#F7F4FA'},rowPageBreak:'avoid',showHead:'everyPage'});
 }
 const total=doc.getNumberOfPages();for(let page=1;page<=total;page++){doc.setPage(page);doc.setFont('MTSText','normal');doc.setFontSize(8);if(demo){doc.setTextColor('#79501B');doc.text('ДЕМО · Личные показатели вымышлены для тестового аккаунта',14,197);}doc.setTextColor('#625B71');doc.text(`Сформирован ${reportDate(stats.generatedAt)}`,14,202);doc.text(`${page} / ${total}`,283,202,{align:'right'});}
 return new Uint8Array(doc.output('arraybuffer'));
}
function printValue(value:ReportValue,format?:string){return value===null?'Нет данных':typeof value==='number'?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:format==='minutes'||format==='decimal'?2:1}).format(value):value;}
export async function createShiftXlsx(stats:ShiftStatistics,context:ReportContext):Promise<Uint8Array>{
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();
 const demo=context.personal?.source==='demo';
 book.creator='UnderCtrl';book.created=new Date(stats.generatedAt);book.title=demo?'ДЕМО — личная статистика':context.personalAccount?'Личная статистика':'Отчёт за период';
 for(const section of shiftReportSections(stats,context)){
  const sheet=book.addWorksheet(section.title,{views:[{state:'frozen',ySplit:4}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const width=section.columns.length;sheet.mergeCells(1,1,1,Math.max(width,2));sheet.getCell(1,1).value='UnderCtrl · '+section.title;
  sheet.getRow(1).font={name:'MTS Text',size:17,bold:true,color:{argb:'FF5D419D'}};sheet.getRow(1).height=30;
  sheet.mergeCells(2,1,2,Math.max(width,2));sheet.getCell(2,1).value=reportDate(stats.start)+' — '+reportDate(stats.end);sheet.getRow(2).height=24;
  if(demo){sheet.mergeCells(3,1,3,Math.max(width,2));sheet.getCell(3,1).value='ДЕМОНСТРАЦИОННЫЕ ЛИЧНЫЕ ДАННЫЕ — тестовый аккаунт';sheet.getRow(3).font={name:'MTS Text',size:10,bold:true,color:{argb:'FF79501B'}};sheet.getRow(3).height=24;}
  else sheet.addRow([]);
  sheet.addRow(section.columns.map(c=>c.label));
  if(section.rows.length)section.rows.forEach(row=>sheet.addRow(row.map(value=>typeof value==='string'?value.slice(0,32767):value)));
  else sheet.addRow(['Нет данных за выбранный период']);
  sheet.columns.forEach((column,index)=>{
   const header=section.columns[index]?.label??'';
   column.width=section.columns.length===1?115:index===0?Math.min(65,Math.max(24,header.length+3)):section.rows.some(row=>typeof row[index]==='string'&&String(row[index]).length>40)?48:Math.max(20,Math.min(30,header.length+2));
   if(section.columns[index]?.format==='minutes'||section.columns[index]?.format==='decimal')column.numFmt='#,##0.00';
  });
  sheet.eachRow((row,index)=>{
   if(index<4)return;
   row.alignment={vertical:'top',wrapText:true};row.font={name:'MTS Text',size:11,color:{argb:'FF231E32'}};
   row.eachCell({includeEmpty:true},cell=>{if(index===4){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF5D419D'}};cell.font={name:'MTS Text',bold:true,size:11,color:{argb:'FFFFFFFF'}};}else if(index%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7F4FA'}};});
   const values=Array.isArray(row.values)?row.values:[];
   const lines=Math.max(1,...values.map((value,column)=>Math.ceil(String(value??'').length/Math.max(10,(sheet.getColumn(column||1).width??25)-3))));
   row.height=Math.min(409,Math.max(index===4?38:25,lines*16+10));
  });
  if(section.rows.length)sheet.autoFilter={from:{row:4,column:1},to:{row:4+section.rows.length,column:width}};
  sheet.headerFooter.oddFooter=(demo?'ДЕМО — тестовый аккаунт — ':'UnderCtrl — ')+'&P / &N';
 }
 return new Uint8Array(await book.xlsx.writeBuffer());
}
