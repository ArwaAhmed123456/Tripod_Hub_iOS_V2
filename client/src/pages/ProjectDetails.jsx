// Live Deployment v1.0.1
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Search, Download, Users, Calendar, Settings, Lock, Eye, EyeOff, Edit2, Trash2, X, Save, AlertTriangle, LogOut, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import toast, { Toaster } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const ProjectDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [logs, setLogs] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showPassModal, setShowPassModal] = useState(false);
    const [newPass, setNewPass] = useState({ password: '', confirm: '' });
    const [showPass, setShowPass] = useState(false);

    // Edit/Delete State
    const [editingLog, setEditingLog] = useState(null);
    const [deletingLog, setDeletingLog] = useState(null);
    const [confirmName, setConfirmName] = useState('');
    const [viewImageObj, setViewImageObj] = useState(null); // to show full screen images
    const [includePhotos, setIncludePhotos] = useState(false); // toggle for PDF

    // Date Range Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Add Manual Log State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newLog, setNewLog] = useState({
        name: '',
        trade: '',
        car_reg: '',
        user_type: 'Employee',
        employee_company_name: '',
        time_in: '',
        time_out: '',
        date: new Date().toISOString().split('T')[0]
    });

    const formatDateUK = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const getHrsMins = (decimalHours) => {
        if (!decimalHours) return { hrs: 0, mins: 0 };
        const hrs = Math.floor(decimalHours);
        const mins = Math.round((decimalHours - hrs) * 60);
        return { hrs, mins };
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        try {
            const res = await api.get(`/logs/project/${id}`);
            setProject(res.data.project);
            setLogs(res.data.logs);
        } catch (err) {
            if (err.response?.status === 401) navigate('/admin/login');
            toast.error("Failed to load project details");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPass.password !== newPass.confirm) {
            toast.error("Passwords do not match");
            return;
        }

        try {
            await api.put(`/projects/${id}/password`, { password: newPass.password });
            toast.success("Project password updated");
            setShowPassModal(false);
            setNewPass({ password: '', confirm: '' });
        } catch (err) {
            toast.error("Update failed");
        }
    };

    // Edit Log Functions
    const handleEditClick = (log) => {
        setEditingLog({ ...log });
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditingLog(prev => ({ ...prev, [name]: value }));
    };

    const handleEditSave = async () => {
        try {
            await api.put(`/logs/${editingLog.id}`, editingLog);
            toast.success("Log updated successfully");
            setEditingLog(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to update log");
        }
    };

    // Delete Log Functions
    const handleDeleteClick = (log) => {
        setDeletingLog(log);
        setConfirmName('');
    };

    const handleDeleteConfirm = async () => {
        if (confirmName !== deletingLog.name) {
            toast.error("Name does not match");
            return;
        }

        try {
            await api.delete(`/logs/${deletingLog.id}`);
            toast.success("Log deleted successfully");
            setDeletingLog(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to delete log");
        }
    };

    const handleCheckout = async (logId) => {
        try {
            await api.post(`/logs/${logId}/checkout`);
            toast.success("Worker checked out successfully");
            fetchData();
        } catch (err) {
            toast.error("Checkout failed");
        }
    };

    const handleAddClick = () => {
        setNewLog({
            name: '',
            trade: '',
            car_reg: '',
            user_type: 'Employee',
            employee_company_name: '',
            time_in: '',
            time_out: '',
            date: new Date().toISOString().split('T')[0]
        });
        setShowAddModal(true);
    };

    const handleAddChange = (e) => {
        const { name, value } = e.target;
        setNewLog(prev => ({ ...prev, [name]: value }));
    };

    const handleAddSave = async (e) => {
        e.preventDefault();
        if (!newLog.name || !newLog.time_in || !newLog.date) {
            toast.error("Please fill in required fields (Name, Time In, Date)");
            return;
        }

        try {
            await api.post('/logs/manual', {
                ...newLog,
                project_id: id
            });
            toast.success("Log added manually");
            setShowAddModal(false);
            fetchData();
        } catch (err) {
            toast.error("Failed to add log");
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = log.name.toLowerCase().includes(search.toLowerCase()) ||
                              formatDateUK(log.date).includes(search) ||
                              log.trade?.toLowerCase().includes(search.toLowerCase()) ||
                              log.employee_company_name?.toLowerCase().includes(search.toLowerCase()) ||
                              log.user_type?.toLowerCase().includes(search.toLowerCase());

        let matchesDateRange = true;
        if (startDate && endDate) {
            // log.date is formatted as YYYY-MM-DD
            matchesDateRange = log.date >= startDate && log.date <= endDate;
        }

        return matchesSearch && matchesDateRange;
    });

    // Simple stats
    const uniqueWorkers = new Set(filteredLogs.map(l => l.name)).size;
    const today = new Date().toISOString().split('T')[0];
    const presentToday = filteredLogs.filter(l => l.date === today).length;

    // Helper to load image as base64
    const getBase64ImageFromUrl = async (imageUrl) => {
        try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => resolve(reader.result), false);
                reader.addEventListener("error", (err) => reject(err), false);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load image for PDF:", e);
            return null;
        }
    };

    const downloadPDF = async () => {
        try {
            const doc = new jsPDF();
            const toastId = toast.loading("Generating PDF... This may take a moment.");

            doc.setFontSize(18);
            doc.text(project.name, 14, 22);
            doc.setFontSize(11);
            doc.text(`Project Code: ${project.code}`, 14, 30);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);

            let y = 45;

            // Header layout changes slightly based on photos
            const headers = includePhotos ? 
                ["Date", "Name", "Company", "Car", "Photo", "In", "Out", "Hrs", "Min"] : 
                ["Date", "Name", "Company", "Car", "Type", "In", "Out", "Hrs", "Min"];
            
            const xPos = includePhotos ? 
                [14, 38, 65, 95, 118, 145, 160, 175, 188] : // photo takes 118 to 145 space
                [14, 38, 65, 95, 118, 138, 153, 170, 185];

            doc.setFont(undefined, 'bold');
            headers.forEach((h, i) => doc.text(h, xPos[i], y));
            doc.line(14, y + 2, 195, y + 2);
            y += 10;

            doc.setFont(undefined, 'normal');

            // Increase row height if photos are included
            const rowHeight = includePhotos ? 20 : 8;

            for (let i = 0; i < filteredLogs.length; i++) {
                const log = filteredLogs[i];

                if (y > (includePhotos ? 260 : 280)) {
                    doc.addPage();
                    y = 20;
                    // Redraw headers on new page
                    doc.setFont(undefined, 'bold');
                    headers.forEach((h, idx) => doc.text(h, xPos[idx], y));
                    doc.line(14, y + 2, 195, y + 2);
                    y += 10;
                    doc.setFont(undefined, 'normal');
                }

                const { hrs, mins } = getHrsMins(log.hours);
                
                // Print text data aligned with the top of the row
                const textY = includePhotos ? y + 8 : y;

                doc.text(String(formatDateUK(log.date)), xPos[0], textY);
                doc.text(String(log.name).substring(0, includePhotos ? 10 : 12), xPos[1], textY);
                doc.text(String(log.trade || '-').substring(0, includePhotos ? 10 : 12), xPos[2], textY);
                doc.text(String(log.car_reg || '-').substring(0, 10), xPos[3], textY);
                
                if (includePhotos) {
                    if (log.image_url) {
                        const imgUrl = `https://attendence-app-uzvt.onrender.com${log.image_url}`;
                        const base64Img = await getBase64ImageFromUrl(imgUrl);
                        if (base64Img) {
                            // (base64, format, x, y, width, height)
                            doc.addImage(base64Img, 'JPEG', xPos[4], y - 2, 22, 14);
                        } else {
                            doc.text("Error", xPos[4], textY);
                        }
                    } else {
                        doc.setTextColor(150);
                        doc.text("No Photo", xPos[4], textY);
                        doc.setTextColor(0);
                    }
                } else {
                    doc.text(String(log.user_type || 'Employee').substring(0, 10), xPos[4], textY);
                }

                doc.text(String(log.time_in), xPos[5], textY);
                doc.text(String(log.time_out || '-'), xPos[6], textY);
                doc.text(String(log.time_out ? hrs : '-'), xPos[7], textY);
                doc.text(String(log.time_out ? mins : '-'), xPos[8], textY);
                
                y += rowHeight;
            }

            doc.save(`${project.name}_Report.pdf`);
            toast.dismiss(toastId);
            toast.success("PDF report downloaded successfully!");
        } catch (err) {
            console.error("PDF Export error:", err);
            toast.dismiss();
            toast.error("Failed to generate PDF. Check console for details.");
        }
    };

    const downloadExcel = () => {
        if (filteredLogs.length === 0) {
            toast.error("No logs available to export.");
            return;
        }

        const toastId = toast.loading("Generating Excel file...");
        try {
            const exportData = filteredLogs.map(log => {
                const { hrs, mins } = getHrsMins(log.hours);
                return {
                    Date: formatDateUK(log.date),
                    Name: log.name,
                    Company: log.trade || '-',
                    'Employee Company Name': log.employee_company_name || '-',
                    'Car Reg': log.car_reg || '-',
                    'User Type': log.user_type || 'Employee',
                    'Time In': log.time_in,
                    'Time Out': log.time_out || 'Active',
                    Hours: log.time_out ? hrs : '-',
                    Mins: log.time_out ? mins : '-'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Logs");

            const colWidths = [
                { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, 
                { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }
            ];
            worksheet['!cols'] = colWidths;

            XLSX.writeFile(workbook, `${project.name}_Report.xlsx`);
            toast.success("Excel report downloaded successfully!", { id: toastId });
        } catch (err) {
            console.error("Excel Export error:", err);
            toast.error("Failed to generate Excel.", { id: toastId });
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;
    if (!project) return <div className="p-8">Project not found</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <Toaster position="top-right" />

            {/* Add Manual Log Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Add Manual Log</h3>
                            <button onClick={() => setShowAddModal(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                        </div>
                        <form onSubmit={handleAddSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Name <span className="text-red-500">*</span></label>
                                <input name="name" value={newLog.name} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" placeholder="Full Name" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Company</label>
                                    <input name="trade" value={newLog.trade} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" placeholder="e.g. Acme Corp" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Car Reg</label>
                                    <input name="car_reg" value={newLog.car_reg} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" placeholder="ABC-123" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-2">User Type</label>
                                <div className="flex bg-slate-50 p-1 rounded-lg border">
                                    {['Employee', 'Visitor'].map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setNewLog(prev => ({
                                                ...prev,
                                                user_type: type,
                                                employee_company_name: type === 'Employee' ? (prev.employee_company_name || '') : ''
                                            }))}
                                            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${newLog.user_type === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {newLog.user_type === 'Employee' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">
                                        Employee Company Name <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                                    </label>
                                    <input
                                        name="employee_company_name"
                                        value={newLog.employee_company_name || ''}
                                        onChange={handleAddChange}
                                        className="w-full p-3 border rounded-lg bg-slate-50"
                                        placeholder="Enter employee company name"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Time In <span className="text-red-500">*</span></label>
                                    <input type="time" name="time_in" value={newLog.time_in} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Time Out</label>
                                    <input type="time" name="time_out" value={newLog.time_out} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Date <span className="text-red-500">*</span></label>
                                <input type="date" name="date" value={newLog.date} onChange={handleAddChange} className="w-full p-3 border rounded-lg bg-slate-50" required />
                            </div>
                            <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition flex items-center justify-center gap-2 mt-4">
                                <Plus size={18} /> Add Log Entry
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingLog && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Edit Log</h3>
                            <button onClick={() => setEditingLog(null)}><X className="text-slate-400 hover:text-red-500" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
                                <input name="name" value={editingLog.name} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Company</label>
                                    <input name="trade" value={editingLog.trade || ''} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Car Reg</label>
                                    <input name="car_reg" value={editingLog.car_reg || ''} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-2">User Type</label>
                                <div className="flex bg-slate-50 p-1 rounded-lg border">
                                    {['Employee', 'Visitor'].map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setEditingLog(prev => ({
                                                ...prev,
                                                user_type: type,
                                                employee_company_name: type === 'Employee' ? (prev.employee_company_name || '') : ''
                                            }))}
                                            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${(editingLog.user_type || 'Employee') === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {(editingLog.user_type || 'Employee') === 'Employee' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">
                                        Employee Company Name <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                                    </label>
                                    <input
                                        name="employee_company_name"
                                        value={editingLog.employee_company_name || ''}
                                        onChange={handleEditChange}
                                        className="w-full p-3 border rounded-lg bg-slate-50"
                                        placeholder="Enter employee company name"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Time In</label>
                                    <input type="time" name="time_in" value={editingLog.time_in} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Time Out</label>
                                    <input type="time" name="time_out" value={editingLog.time_out} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Date</label>
                                <input type="date" name="date" value={editingLog.date} onChange={handleEditChange} className="w-full p-3 border rounded-lg bg-slate-50" />
                            </div>
                            <button onClick={handleEditSave} className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition flex items-center justify-center gap-2 mt-4">
                                <Save size={18} /> Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingLog && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border-4 border-red-50">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="bg-red-100 p-4 rounded-full mb-4">
                                <AlertTriangle className="text-red-500 w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Confirm Deletion</h3>
                            <p className="text-slate-500 mt-2 text-sm">
                                To confirm deletion, please type the user name below:<br />
                                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded mt-1 inline-block">{deletingLog.name}</span>
                            </p>
                        </div>

                        <input
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            placeholder="Type user name here"
                            className="w-full p-3 border-2 border-slate-200 rounded-lg mb-6 text-center font-bold focus:border-red-500 focus:outline-none"
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletingLog(null)}
                                className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={confirmName !== deletingLog.name}
                                className={`flex-1 py-3 font-bold text-white rounded-lg transition flex items-center justify-center gap-2
                                    ${confirmName === deletingLog.name ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200' : 'bg-slate-200 cursor-not-allowed'}
                                `}
                            >
                                <Trash2 size={18} /> Delete Log
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Image Modal */}
            {viewImageObj && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewImageObj(null)}>
                    <div className="relative max-w-4xl w-full p-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewImageObj(null)} className="absolute -top-10 right-0 text-white hover:text-red-500 bg-black/50 rounded-full p-2">
                            <X size={24} />
                        </button>
                        <img 
                            src={`https://attendence-app-uzvt.onrender.com${viewImageObj.image_url}`} 
                            alt={`Plate for ${viewImageObj.car_reg}`} 
                            className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl bg-white" 
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/800x400?text=Image+Not+Found'; }}
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-6 py-2 rounded-full shadow-lg">
                            <p className="text-white font-mono font-bold text-lg">{viewImageObj.car_reg} • {viewImageObj.name}</p>
                        </div>
                    </div>
                </div>
            )}

            <nav className="bg-white shadow-lg p-5 px-12 sticky top-0 z-50 flex justify-between items-center border-b-4 border-primary">
                <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-slate-600 hover:text-white font-semibold transition bg-primary/10 px-5 py-2.5 rounded-lg hover:bg-primary">
                    <ArrowLeft size={20} /> Back to Dashboard
                </button>
                <img src="/Tipod_Final_Logo_high_pixel.png" className="h-16 w-auto" alt="Logo" />
            </nav>

            <div className="max-w-7xl mx-auto p-8 lg:p-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
                            <span className="bg-primary/20 text-primary text-xs font-mono font-bold px-3 py-1 rounded-full uppercase">{project.code}</span>
                        </div>
                        <p className="text-slate-500">Project Oversight & Attendance Logs</p>
                    </div>

                    <div className="flex gap-4 items-center flex-wrap">
                        {/* Date Range Selectors */}
                        <div className="flex items-center gap-2 bg-white border-2 border-slate-200 px-3 py-2 rounded-2xl">
                            <Calendar size={18} className="text-slate-400" />
                            <input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)} 
                                className="text-sm text-slate-600 outline-none bg-transparent"
                            />
                            <span className="text-slate-400 text-sm font-bold">to</span>
                            <input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)} 
                                className="text-sm text-slate-600 outline-none bg-transparent"
                            />
                            {(startDate || endDate) && (
                                <button 
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    className="p-1 text-slate-400 hover:text-red-500 transition"
                                    title="Clear Dates"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-white border-2 border-slate-200 px-4 py-3 rounded-2xl cursor-pointer hover:bg-slate-50 transition">
                            <input 
                                type="checkbox" 
                                checked={includePhotos} 
                                onChange={(e) => setIncludePhotos(e.target.checked)}
                                className="w-5 h-5 rounded text-primary focus:ring-primary"
                            />
                            Include Photos in PDF
                        </label>
                        <button
                            onClick={handleAddClick}
                            className="bg-white text-primary border-2 border-primary px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-primary/5 transition font-bold"
                        >
                            <Plus size={20} /> Add Manual Log
                        </button>
                        <button
                            onClick={downloadPDF}
                            className="bg-primary text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-primary/90 transition shadow-lg shadow-primary/20 font-bold whitespace-nowrap"
                        >
                            <Download size={20} /> Export PDF
                        </button>
                        <button
                            onClick={downloadExcel}
                            className="bg-emerald-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20 font-bold whitespace-nowrap"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Export Excel
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className="bg-primary/20 p-3 rounded-full text-primary">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-gray-500 text-sm">Present Today</p>
                            <h2 className="text-2xl font-bold">{presentToday}</h2>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className="bg-primary/20 p-3 rounded-full text-primary">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-gray-500 text-sm">Total Workers (Filtered)</p>
                            <h2 className="text-2xl font-bold">{uniqueWorkers}</h2>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className="bg-orange-100 p-3 rounded-full text-orange-600">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <p className="text-gray-500 text-sm">Total Logs</p>
                            <h2 className="text-2xl font-bold">{filteredLogs.length}</h2>
                        </div>
                    </div>
                </div>


                {/* Filters */}
                <div className="bg-white p-4 rounded-t-xl border-b border-gray-100 flex items-center gap-4">
                    <Search size={20} className="text-gray-400" />
                    <input
                        placeholder="Search by specific person, date, company..."
                        className="flex-1 outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Table */}
                <div className="bg-white rounded-b-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium text-sm uppercase">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Company</th>
                                <th className="p-4">Car Reg</th>
                                <th className="p-4 text-center">Photo</th>
                                <th className="p-4">User Type</th>
                                <th className="p-4">Time In</th>
                                <th className="p-4">Time Out</th>
                                <th className="p-4">Hrs</th>
                                <th className="p-4">Mins</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 group">
                                    <td className="p-4 text-gray-600">{formatDateUK(log.date)}</td>
                                    <td className="p-4 font-medium text-gray-900">{log.name}</td>
                                    <td className="p-4 text-gray-600">
                                        <div>{log.trade || '-'}</div>
                                        {log.employee_company_name && (
                                            <div className="text-xs text-slate-400 font-normal">Emp: {log.employee_company_name}</div>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600 font-mono text-sm">{log.car_reg || '-'}</td>
                                    <td className="p-4 text-center">
                                        {log.image_url ? (
                                            <button 
                                                onClick={() => setViewImageObj(log)}
                                                className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100 transition shadow-sm border border-blue-200"
                                                title="View Vehicle Plate"
                                            >
                                                <Eye size={18} />
                                            </button>
                                        ) : (
                                            <span className="text-gray-300 italic text-xs">No Photo</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs ${log.user_type === 'Visitor' ? 'bg-orange-100 text-orange-700' : 'bg-primary/20 text-primary'}`}>
                                            {log.user_type}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600">{log.time_in}</td>
                                    <td className="p-4 text-gray-600">{log.time_out || <span className="text-orange-500 font-bold italic">Active</span>}</td>
                                    <td className="p-4 font-bold text-gray-800">{log.time_out ? getHrsMins(log.hours).hrs : '-'}</td>
                                    <td className="p-4 font-bold text-gray-800">{log.time_out ? getHrsMins(log.hours).mins : '-'}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2 group-hover:opacity-100 transition-opacity">
                                            {!log.time_out && (
                                                <button
                                                    onClick={() => handleCheckout(log.id)}
                                                    className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition"
                                                    title="Force Checkout"
                                                >
                                                    <LogOut size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleEditClick(log)}
                                                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                title="Edit Log"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(log)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                title="Delete Log"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="p-8 text-center text-gray-400">No logs found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetails;
