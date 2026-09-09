const express     = require('express');
const router      = express.Router();
const jwt         = require('jsonwebtoken');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const ActivityLog = require('../models/ActivityLog');
const Site        = require('../models/Site');
const VisitorGroup = require('../models/VisitorGroup');
const { addWorker, removeWorker, restoreWorker } = require('../services/manifestCache');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';
const verifyToken = (req,res,next) => {
  const auth=req.headers['authorization'];
  if(!auth) return res.status(403).json({error:'No token'});
  try { req.user=jwt.verify(auth.split(' ')[1],JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Unauthorized'}); }
};

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{ const code=(req.body.project_code||'UNKNOWN').trim().toUpperCase(); const dir=`uploads/${code}/`; if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); cb(null,dir); },
  filename:(req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname))
});
const upload = multer({storage});

const fmt = (l) => ({ ...l, _id:l._id, id:l._id?.toString(), project_id:l.siteId,
  time_in:l.timeIn, time_out:l.timeOut, user_type:l.userType, employee_company_name:l.employeeCompanyName || l.employee_company_name || null, car_reg:l.carReg, image_url:l.imageUrl, created_at:l.createdAt });

const nowStr = () => { const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; };

router.get('/', async (req,res) => {
  const {project_code}=req.query;
  if (!project_code) return res.status(400).json({error:'Missing project_code'});
  try {
    const site=await Site.findOne({code:project_code.trim().toUpperCase()}).lean();
    if (!site) return res.status(404).json({error:'Project not found'});
    const logs=await ActivityLog.find({siteId:site._id}).sort({date:-1,timeIn:1}).lean();
    res.json(logs.map(fmt));
  } catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

router.post('/', upload.single('image'), async (req,res) => {
  const {project_code,name,trade,car_reg,user_type,employee_company_name,time_in,time_out,date,reason}=req.body;
  if (!project_code||!name||!time_in||!date) return res.status(400).json({error:'Missing required fields'});
  try {
    const site=await Site.findOne({code:project_code.trim().toUpperCase()}).lean();
    if (!site) return res.status(400).json({error:'Invalid project code'});
    let hours=null;
    if (time_out) { const ms=new Date(`${date}T${time_out}`)-new Date(`${date}T${time_in}`); hours=parseFloat(((ms<0?ms+86400000:ms)/3600000).toFixed(2)); }
    const empCompany = (user_type === 'Employee' && employee_company_name) ? employee_company_name.trim() : null;
    const data={siteId:site._id,name,trade:trade||'',employeeCompanyName:empCompany,carReg:car_reg||'',userType:user_type||'Employee',timeIn:time_in,timeOut:time_out||null,hours,date,reason:reason||''};
    if (req.file) data.imageUrl=`/uploads/${project_code.trim().toUpperCase()}/${req.file.filename}`;
    const log=await ActivityLog.create(data);
    const io=req.app.get('io'); if(io) io.emit('newAttendance',{name,project_code,date,time_in});
    addWorker(project_code,log);
    let group=null; if(req.body.visitor_group) group=await VisitorGroup.findOne({siteId:site._id,name:req.body.visitor_group}).lean();
    try { const eb=require('../services/eventBus'); eb.emit('checkin',{log:fmt(log),project:site,group}); } catch{}
    res.json({success:true,message:'Check-in successful',id:log._id});
  } catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

router.post('/manual', verifyToken, async (req,res) => {
  const {project_id,name,trade,car_reg,user_type,employee_company_name,time_in,time_out,date}=req.body;
  if (!project_id||!name||!time_in||!date) return res.status(400).json({error:'Missing required fields'});
  let hours=0;
  if (time_out){ const ms=new Date(`${date}T${time_out}`)-new Date(`${date}T${time_in}`); hours=parseFloat(((ms<0?ms+86400000:ms||86400000)/3600000).toFixed(2)); }
  try {
    const empCompany = (user_type === 'Employee' && employee_company_name) ? employee_company_name.trim() : null;
    await ActivityLog.create({siteId:project_id,name,trade:trade||'',employeeCompanyName:empCompany,carReg:car_reg||'',userType:user_type||'Employee',timeIn:time_in,timeOut:time_out||null,hours,date});
    res.json({success:true,message:'Log created manually'});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.get('/active/:projectCode', async (req,res) => {
  try {
    const site=await Site.findOne({code:req.params.projectCode.trim().toUpperCase()}).lean();
    if (!site) return res.status(400).json({error:'Invalid project'});
    const logs=await ActivityLog.find({siteId:site._id,timeOut:null}).sort({date:-1,timeIn:1}).lean();
    res.json(logs.map(fmt));
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.get('/recent/:projectCode', async (req,res) => {
  const today=new Date().toISOString().split('T')[0];
  try {
    const site=await Site.findOne({code:req.params.projectCode.trim().toUpperCase()}).lean();
    if (!site) return res.status(400).json({error:'Invalid project'});
    const logs=await ActivityLog.find({siteId:site._id,timeOut:{$ne:null},date:today}).sort({createdAt:-1}).limit(20).lean();
    res.json(logs.map(fmt));
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.post('/:id/checkout', async (req,res) => {
  let {timeOut}=req.body;
  if (!timeOut) timeOut=nowStr();
  try {
    const log=await ActivityLog.findById(req.params.id);
    if (!log) return res.status(404).json({error:'Log not found'});
    const ms=new Date(`${log.date}T${timeOut}`)-new Date(`${log.date}T${log.timeIn}`);
    const hours=parseFloat(((ms<0?ms+86400000:ms||86400000)/3600000).toFixed(2));
    log.timeOut=timeOut; log.hours=hours; await log.save();
    const site=await Site.findById(log.siteId).lean();
    if (site){ removeWorker(site.code,log._id); try{const eb=require('../services/eventBus'); eb.emit('checkout',{log:fmt(log.toObject()),project:site});}catch{} }
    res.json({success:true,message:'Checkout successful',time_out:timeOut,hours});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.get('/project/:id', verifyToken, async (req,res) => {
  try {
    const site=await Site.findById(req.params.id).lean();
    if (!site) return res.status(404).json({error:'Project not found'});
    const logs=await ActivityLog.find({siteId:site._id}).sort({date:-1,timeIn:1}).lean();
    res.json({project:{...site,_id:site._id},logs:logs.map(fmt)});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.put('/:id', verifyToken, async (req,res) => {
  const {name,trade,car_reg,user_type,employee_company_name,time_in,time_out,reason,date}=req.body;
  try {
    const ms=new Date(`${date}T${time_out}`)-new Date(`${date}T${time_in}`);
    const hours=parseFloat(((ms<0?ms+86400000:ms||86400000)/3600000).toFixed(2));
    const empCompany = (user_type === 'Employee' && employee_company_name) ? employee_company_name.trim() : null;
    await ActivityLog.findByIdAndUpdate(req.params.id,{name,trade,employeeCompanyName:empCompany,carReg:car_reg,userType:user_type,timeIn:time_in,timeOut:time_out,hours,reason,date});
    res.json({success:true,message:'Log updated'});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

router.delete('/:id', verifyToken, async (req,res) => {
  try { await ActivityLog.findByIdAndDelete(req.params.id); res.json({success:true}); }
  catch(err){ res.status(500).json({error:'Server error'}); }
});

router.post('/:id/undo-checkout', async (req,res) => {
  try {
    const log=await ActivityLog.findByIdAndUpdate(req.params.id,{timeOut:null,hours:null},{new:true}).lean();
    const site=await Site.findById(log.siteId).lean(); if(site) restoreWorker(site.code,log._id);
    res.json({success:true});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

module.exports = router;
