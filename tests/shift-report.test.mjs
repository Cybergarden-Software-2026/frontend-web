import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildShiftStatistics } from '../src/domain/shiftStatistics.ts';
import { createShiftPdf,createShiftXlsx } from '../src/reports/shiftReportFiles.ts';
import { reportNotes,shiftReportSections } from '../src/reports/shiftReportModel.ts';
const start=Date.parse('2026-11-21T06:00:00Z'),end=start+12*3600_000;
const item=(n,patch={})=>({sysId:String(n),id:'INC-'+n,header:'Оплата картой завершается ошибкой подтверждения платежа в мобильном приложении',description:'Описание',productName:'SmartPay',service:'Платёжный шлюз',stateEnum:'Assigned',stateId:0,state:'Назначен',priorityId:4,priority:'Наивысший',assignedGroupName:'',submitDate:new Date(start-3600_000).toISOString(),deadline:new Date(end-1000).toISOString(),completionDate:null,...patch});
const before=item(1,{id:'=SUM(1,1)'}),after={...before,assignedGroupName:'Платёжная платформа'};
const event={eventId:1,revision:1,sysId:'1',incidentId:before.id,header:before.header,types:['team'],fields:['assignedGroupName'],at:new Date(start+5*60_000).toISOString(),previous:before,current:after};
const stats=buildShiftStatistics([after,...Array.from({length:35},(_,n)=>item(n+2))],[event],start,end,end+1000);
const context={revision:42,connected:false,historyIncomplete:true,updatedAt:new Date(end).toISOString()};
test('Excel report contains coordinator metrics, complete handover, numeric durations and safe text',async()=>{
 const bytes=await createShiftXlsx(stats,context),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.deepEqual(book.worksheets.map(s=>s.name),shiftReportSections(stats,context).map(s=>s.title));
 assert.equal(book.getWorksheet('Передача смены').rowCount,39);
 const transfers=book.getWorksheet('Передачи командам');assert.equal(transfers.getCell('A5').value,'=SUM(1,1)');assert.equal(transfers.getCell('A5').type,ExcelJS.ValueType.String);
 assert.equal(transfers.getCell('E5').value,65);assert.equal(transfers.getCell('F5').value,5);assert.equal(transfers.getCell('E5').numFmt,'#,##0.00');
 assert.equal(transfers.views[0].ySplit,4);assert.ok(transfers.autoFilter);
 const notes=book.getWorksheet('Методика');assert.ok(notes.getRows(5,notes.rowCount-4).some(r=>String(r.getCell(1).value).includes('Автор назначения')));
 assert.ok(reportNotes(stats,context).some(note=>note.includes('не полностью')));
 if(process.env.UNDERCTRL_REPORT_QA_DIR){mkdirSync(process.env.UNDERCTRL_REPORT_QA_DIR,{recursive:true});writeFileSync(process.env.UNDERCTRL_REPORT_QA_DIR+'/coordinator-report.xlsx',bytes);}
});
test('PDF exports actual PDF bytes with embedded MTS fonts and multipage handover',async()=>{
 const regular=new Uint8Array(readFileSync(new URL('../public/fonts/report/MTSText-Regular.ttf',import.meta.url))),bold=new Uint8Array(readFileSync(new URL('../public/fonts/report/MTSText-Bold.ttf',import.meta.url)));
 const bytes=await createShiftPdf(stats,context,{regular,bold});assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');assert.ok(bytes.length>10000);
 if(process.env.UNDERCTRL_REPORT_QA_DIR){mkdirSync(process.env.UNDERCTRL_REPORT_QA_DIR,{recursive:true});writeFileSync(process.env.UNDERCTRL_REPORT_QA_DIR+'/coordinator-report.pdf',bytes);}
});
test('empty-period Excel has no fabricated means, no blank default sheet, and explicit empty tables',async()=>{
 const empty=buildShiftStatistics([],[],start,end,end),bytes=await createShiftXlsx(empty,{...context,connected:true,historyIncomplete:false});
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.equal(book.worksheets.length,8);assert.equal(book.getWorksheet('Передачи командам').getCell('A5').value,'Нет данных за выбранный период');
 assert.equal(shiftReportSections(empty,context)[0].rows.find(r=>r[0]==='KPI: доля передач меньше 10 минут, %')[1],null);
});
test('personal demo export has four compact sheets, all transfers, and explicit provenance on every sheet',async()=>{
 const {buildPersonalStatistics}=await import('../src/domain/personalStatistics.ts');
 const {DEMO_COORDINATOR,createDemoCoordinatorHistory}=await import('./fixtures/demoPersonalStatistics.mjs');
 const personal=buildPersonalStatistics(DEMO_COORDINATOR,createDemoCoordinatorHistory(end),start,end,'demo');
 const ctx={...context,personal,generalAvailable:false},sections=shiftReportSections(stats,ctx);
 assert.deepEqual(sections.map(s=>s.title),['Личная статистика','Мои распределения','Общая очередь','О данных']);
 assert.ok(sections[2].rows.every(row=>row[1]===null));
 const bytes=await createShiftXlsx(stats,ctx),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.equal(book.getWorksheet('Мои распределения').rowCount,4+personal.transferred);
 for(const sheet of book.worksheets)assert.match(sheet.getCell('A3').value,/ДЕМОНСТРАЦИОННЫЕ/);
 assert.equal(book.getWorksheet('Мои распределения').getCell('E5').type,ExcelJS.ValueType.Number);
 if(process.env.UNDERCTRL_REPORT_QA_DIR){
  writeFileSync(process.env.UNDERCTRL_REPORT_QA_DIR+'/personal-demo.xlsx',bytes);
  const regular=new Uint8Array(readFileSync(new URL('../public/fonts/report/MTSText-Regular.ttf',import.meta.url))),bold=new Uint8Array(readFileSync(new URL('../public/fonts/report/MTSText-Bold.ttf',import.meta.url)));
  writeFileSync(process.env.UNDERCTRL_REPORT_QA_DIR+'/personal-demo.pdf',await createShiftPdf(stats,ctx,{regular,bold}));
 }
});
