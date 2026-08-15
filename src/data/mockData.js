// Mock data shaped exactly like the tables in the architecture doc
// (families, members, sacraments, organizations, events, notifications, donations)
// Swap src/services/api.js from MOCK_MODE=true to false once the NestJS backend is live.

export const families = [
  {
    id: 'f1',
    family_code: 'SFA-0142',
    house_name: 'Pathrose House',
    address_line1: '12 Church Road',
    place: 'Kalamassery',
    district: 'Ernakulam',
    state: 'Kerala',
    pincode: '683104',
    ward: 'Ward 4',
    basic_christian_community: 'St. Jude BCC',
    head_member_id: 'm1',
    status: 'active',
  },
];

export const members = [
  {
    id: 'm1',
    family_id: 'f1',
    member_number: 'MEM-1001',
    first_name: 'Deejo',
    last_name: 'Pathrose',
    gender: 'Male',
    date_of_birth: '1990-03-14',
    blood_group: 'O+',
    mobile: '+91 98470 00000',
    occupation: 'Engineer',
    marital_status: 'Single',
    relationship_to_head: 'Self',
    baptism_name: 'Bro. Deejo',
    photo: null,
    status: 'active',
    is_family_head: true,
  },
  {
    id: 'm2',
    family_id: 'f1',
    member_number: 'MEM-1002',
    first_name: 'Anna',
    last_name: 'Pathrose',
    gender: 'Female',
    date_of_birth: '1962-08-02',
    blood_group: 'A+',
    mobile: '+91 98470 00001',
    occupation: 'Retired',
    marital_status: 'Married',
    relationship_to_head: 'Mother',
    baptism_name: 'Anna Mary',
    photo: null,
    status: 'active',
    is_family_head: false,
  },
];

export const notifications = [
  { id: 'n1', title: 'Feast Day Mass', message: 'Solemn High Mass at 6:30 AM followed by procession.', type: 'FEAST', created_at: '2026-08-04T09:00:00Z', read: false },
  { id: 'n2', title: 'Catechism resumes', message: 'Sunday school resumes this week for all classes.', type: 'GENERAL', created_at: '2026-08-03T09:00:00Z', read: true },
];

export const events = [
  { id: 'e1', title: 'Parish Feast', venue: 'Main Church', start_date: '2026-08-20', end_date: '2026-08-22', description: 'Annual parish feast with procession and cultural programme.' },
  { id: 'e2', title: 'Youth Retreat', venue: 'Parish Hall', start_date: '2026-08-30', end_date: '2026-08-30', description: 'A day of prayer and fellowship for the youth ministry.' },
];

export const organizations = [
  { id: 'o1', name: 'Choir', description: 'Parish choir ministry', member_count: 24 },
  { id: 'o2', name: 'Legion of Mary', description: 'Prayer and outreach group', member_count: 18 },
  { id: 'o3', name: 'Altar Servers', description: 'Serving at the altar', member_count: 12 },
];

export const sacraments = [
  { id: 's1', member_id: 'm1', type: 'Baptism', church_name: 'St. Francis of Assisi Church', date: '1990-04-01', minister_name: 'Rev. Fr. Thomas', certificate_number: 'BAP-1990-114' },
  { id: 's2', member_id: 'm1', type: 'Confirmation', church_name: 'St. Francis of Assisi Church', date: '2002-05-12', minister_name: 'Bishop Mar Joseph', certificate_number: 'CNF-2002-056' },
];

export const donations = [
  { id: 'd1', member_id: 'm1', amount: 2000, purpose: 'Feast Offering', payment_mode: 'UPI', paid_on: '2026-07-15' },
  { id: 'd2', member_id: 'm1', amount: 500, purpose: 'Church Building Fund', payment_mode: 'Cash', paid_on: '2026-06-01' },
];

export const currentUser = {
  id: 'u1',
  username: 'deejo.pathrose',
  role: 'member', // super_admin | admin | parish_priest | church_secretary | member
  member_id: 'm1',
};
