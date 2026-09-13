import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const defaultGroups = [
  { id: 'visitor', name: 'Visitor' },
  { id: 'worker', name: 'Worker' },
  { id: 'contractor', name: 'Contractor' },
];

const sortByName = (items = []) =>
  [...items].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));

export const getStoredUser = async () => {
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getAccessibleSites = async (preferredSiteId) => {
  const storedUser = await getStoredUser();
  const resolvedSiteId = preferredSiteId || storedUser?.project_id || storedUser?.site_id;

  // Strategy 1: Try fetching the full projects list first (works for guards/managers with multiple sites)
  try {
    const response = await api.get('/projects');
    const allSites = sortByName(response.data || []);
    if (allSites.length) return allSites;
  } catch {
    // fall through to single-site lookup
  }

  // Strategy 2: If only one project is assigned, fetch it directly by ID
  if (resolvedSiteId) {
    try {
      const response = await api.get(`/projects/${resolvedSiteId}/public`);
      return response?.data ? [response.data] : [];
    } catch {
      // fall through
    }
  }

  // Some pre-existing manager sessions were created before a site ID was saved
  // on the device. The site directory is intentionally public for mobile
  // onboarding, so use it as a final fallback instead of showing an empty
  // manager portal.
  try {
    const response = await api.get('/projects/all-public');
    // The hosted API returns { value: [...], Count } while local versions may
    // return the array directly. Normalise both shapes before sorting.
    const sites = Array.isArray(response.data) ? response.data : response.data?.value || [];
    return sortByName(sites);
  } catch {
    return [];
  }
};

const normalizeVisit = (visit) => ({
  ...visit,
  id: visit?.id || visit?._id,
  name: visit?.name || visit?.visitor_name || 'Unknown',
  group: visit?.group || visit?.userType || visit?.visitor_group || 'Visitor',
  sign_in_time: visit?.sign_in_time || visit?.checkIn || visit?.created_at || visit?.createdAt,
  sign_out_time: visit?.sign_out_time || visit?.checkOut || null,
  pre_registered: Boolean(visit?.pre_registered || visit?.preRegistered),
  checked_in_by_guard: Boolean(visit?.checked_in_by_guard || visit?.checkedInByGuard),
  checked_in_by: visit?.checked_in_by || visit?.checkedInBy || '',
});

export const getVisits = async ({ siteId, status, limit = 200, search = '', dateFrom = '', dateTo = '' }) => {
  if (!siteId) return [];
  const response = await api.get('/visits', {
    params: {
      site_id: siteId,
      status,
      limit,
      search: search || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
  });
  const visits = response?.data?.visits || response?.data || [];
  return visits.map(normalizeVisit);
};

export const getVisitStats = async (siteId) => {
  if (!siteId) return { totalIn: 0, visitorsIn: 0, employeesIn: 0 };
  const response = await api.get('/visits/stats', { params: { site_id: siteId } });
  return response?.data || { totalIn: 0, visitorsIn: 0, employeesIn: 0 };
};

export const getPreRegistrations = async ({ siteId, status = 'Pending', search = '' }) => {
  if (!siteId) return [];
  const response = await api.get('/pre-registrations', {
    params: {
      site_id: siteId,
      status,
      search: search || undefined,
    },
  });
  return (response?.data || []).map((item) => ({
    ...item,
    id: item?.id || item?._id,
    name: item?.name || 'Unknown',
  }));
};

export const getVisitorGroups = async (siteId) => {
  if (!siteId) return defaultGroups;
  try {
    const response = await api.get('/visitor-groups', { params: { project_id: siteId } });
    const groups = response?.data || [];

    // Ensure we always provide a sensible set of options for check-in / pre-registration.
    // Some databases might have only one group configured (e.g. "Guard"), which should
    // not remove the default options like Visitor/Employee/Delivery/Contractor.
    const normalize = (g) => ({
      ...g,
      id: g?.id || g?._id || g?.name,
      name: g?.name || 'Visitor',
    });

    const merged = [...defaultGroups, ...groups.map(normalize)]
      .filter((g) => g && g.name)
      .reduce((acc, g) => {
        const key = String(g.name).trim().toLowerCase();
        if (!acc.seen.has(key)) {
          acc.seen.add(key);
          acc.items.push(g);
        }
        return acc;
      }, { seen: new Set(), items: [] }).items;

    return merged.length ? merged : defaultGroups;
  } catch {
    return defaultGroups;
  }
};

export const signInVisitor = async ({ siteId, name, group, notes, carRegistration, companyName, employeeCompanyName }) => {
  const response = await api.post('/visits', {
    site_id: siteId,
    name,
    group,
    notes,
    car_reg: carRegistration || undefined,
    employee_company_name: employeeCompanyName || undefined,
    company_name: companyName || undefined,
  });
  return response?.data;
};

export const signOutVisit = async (visitId) => {
  const response = await api.post(`/visits/${visitId}/sign-out`);
  return response?.data;
};

export const markPreRegisteredArrival = async (preRegistrationId, { carRegistration, companyName } = {}) => {
  const response = await api.post(`/pre-registrations/${preRegistrationId}/arrive`, {
    car_registration: carRegistration || undefined,
    company_name: companyName || undefined,
  });
  return response?.data;
};

export const createPreRegistration = async ({
  siteId,
  name,
  email,
  phone,
  notes,
  companyName,
  expectedDate,
  visitorGroupId,
  visitorGroupName,
  sendInvitation,
}) => {
  const response = await api.post('/pre-registrations', {
    site_id: siteId,
    name,
    email: email || undefined,
    phone: phone || undefined,
    notes: notes || undefined,
    company_name: companyName || undefined,
    expected_date: expectedDate,
    // Send both: API will accept either a real VisitorGroup ObjectId or a label.
    visitor_group_id: visitorGroupId || undefined,
    visitor_group_name: visitorGroupName || undefined,
    send_invitation: Boolean(sendInvitation && email),
  });
  return response?.data;
};

// ── Manager controls (mobile) ─────────────────────────────────────────
export const getPendingGuards = async ({ siteId }) => {
  const response = await api.get('/guards/pending', {
    params: { site_id: siteId || undefined },
  });
  return response?.data || [];
};

export const updateGuardApproval = async ({ guardId, status }) => {
  const response = await api.put(`/guards/${guardId}/approval`, { status });
  return response?.data;
};

export const getPresentGuards = async ({ siteId }) => {
  const response = await api.get('/guards/present', {
    params: { site_id: siteId || undefined },
  });
  return response?.data || [];
};
