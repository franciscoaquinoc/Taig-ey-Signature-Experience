// Vincula este Apps Script a una hoja de Google Sheets.
const HOJA_RESERVAS = 'Reservaciones';
const HOJA_ITEMS = 'Productos';
// Mantén los precios del servidor sincronizados con catalogo.js.
const PRECIOS = {
 e1:['Tuna Turéy Crocante',675],e2:['Ceviche en Guaje Coco',775],e3:['Taquitos de Boriken',925],
 p1:['Risotto Coabey',1170],p2:['Salmón del Bohío',1400],p3:['Lomo Areito',1200],p4:['Cordon Karaya',950],
 d1:['Volcán de Chocolate',750],d2:['Arroz con Leche',510],
 b1:['Mezcalita Guataúba',585],b2:['Anacaona Spritz',575],b3:['Beso Taíno',550]
};
function doPost(e){
 const lock=LockService.getScriptLock();
 try{
  lock.waitLock(20000);
  const d=JSON.parse(e.postData.contents);
  const nombre=limpiar(d.nombre,80),apellido=limpiar(d.apellido,80),telefono=limpiar(d.telefono,25);
  const correo=limpiar(d.correo,120),fecha=limpiar(d.fecha,10),hora=limpiar(d.hora,5),observaciones=limpiar(d.observaciones,500);
  if(!nombre||!apellido||!telefono||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!/^\d{2}:\d{2}$/.test(hora))throw Error('Datos obligatorios inválidos');
  if(!Array.isArray(d.items)||!d.items.length||d.items.length>100)throw Error('Selecciona productos válidos');
  const rows=d.items.map(x=>{const p=PRECIOS[x.id];const q=Number(x.cantidad);if(!p||!Number.isInteger(q)||q<1||q>30)throw Error('Producto o cantidad inválidos');return [p[0],q,p[1],q*p[1]]});
  const total=rows.reduce((s,r)=>s+r[3],0);
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const reservas=hoja(ss,HOJA_RESERVAS,['Código','Registrado el','Nombre','Apellido','Teléfono','Correo','Fecha','Hora','Subtotal RD$','Estado','Observaciones']);
  const productos=hoja(ss,HOJA_ITEMS,['Código','Producto','Cantidad','Precio RD$','Subtotal RD$']);
  const codigo='TG-'+Utilities.getUuid().slice(0,8).toUpperCase();
  reservas.appendRow([codigo,new Date(),nombre,apellido,telefono,correo,fecha,hora,total,'Pendiente',observaciones]);
  productos.getRange(productos.getLastRow()+1,1,rows.length,5).setValues(rows.map(r=>[codigo,...r]));
  return salida({ok:true,codigo,total});
 }catch(err){return salida({ok:false,error:String(err.message||err)})}finally{try{lock.releaseLock()}catch(_){}}
}
function limpiar(v,n){const s=String(v||'').trim().slice(0,n);return /^[=+@\-\t\r]/.test(s)?"'"+s:s}
function hoja(ss,n,headers){let sh=ss.getSheetByName(n);if(!sh){sh=ss.insertSheet(n);sh.appendRow(headers);sh.setFrozenRows(1)}return sh}
function salida(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
