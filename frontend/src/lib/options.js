// Fixed choices for the profile form. Values are stored as-is (English), so keep them stable.
export const POLITICAL_VIEWS = [
  'Bangladesh Awami League',
  'Bangladesh Nationalist Party (BNP)',
  'Bangladesh Jamaat-e-Islami',
  'Jatiya Party (Ershad)',
  'Islami Andolan Bangladesh',
  'National Citizen Party (NCP)',
  'Gano Forum',
  'Workers Party of Bangladesh',
  'Jatiya Samajtantrik Dal (JSD)',
  'Communist Party of Bangladesh (CPB)',
  'No party / Independent',
];

export const RELIGIONS = [
  'Christianity',
  'Islam',
  'Hinduism',
  'Buddhism',
  'Sikhism',
  'Judaism',
  'Jainism',
  "Bahá'í Faith",
  'Folk / Traditional religion',
  'Atheism',
  'Agnosticism',
  'No religion',
  'Other',
];

/** The list plus the stored value when it is not one of the choices (older free-text data is never lost). */
export const withCurrent = (list, current) => (current && !list.includes(current) ? [...list, current] : list);

export const ORG_TYPES = [
  { id: 'COMPANY', label: 'Company', plural: 'Companies' },
  { id: 'ORGANIZATION', label: 'Organization', plural: 'Organizations' },
  { id: 'POLITICAL_PARTY', label: 'Political party', plural: 'Political parties' },
  { id: 'GROUP', label: 'Group', plural: 'Groups' },
  { id: 'NGO', label: 'NGO / non-profit', plural: 'NGOs / non-profits' },
  { id: 'GOVERNMENT', label: 'Government body', plural: 'Government bodies' },
  { id: 'EDUCATIONAL', label: 'Educational institution', plural: 'Educational institutions' },
  { id: 'OTHER', label: 'Other', plural: 'Other' },
];
export const orgTypeLabel = (id) => ORG_TYPES.find((t) => t.id === id)?.label || 'Organization';

/** A person's relation to an organization, worded from each side. */
export const MEMBERSHIP_RELATIONS = [
  { id: 'MEMBER', human: 'is a member of', org: 'has as a member', group: 'Memberships' },
  { id: 'AFFILIATED', human: 'is affiliated with', org: 'is affiliated with', group: 'Affiliations' },
  { id: 'CONNECTED', human: 'is connected to', org: 'is connected to', group: 'Connections' },
];

/** Organization <-> organization links, worded from the viewed organization's side. dir 'out': this -> other. */
export const ORG_LINK_KINDS = [
  { id: 'SUB_UNIT_OF:out', type: 'SUB_UNIT_OF', dir: 'out', label: 'is a sub-unit of', group: 'Part of' },
  { id: 'SUB_UNIT_OF:in', type: 'SUB_UNIT_OF', dir: 'in', label: 'has as a sub-unit', group: 'Sub-units' },
  { id: 'MEMBER_OF:out', type: 'MEMBER_OF', dir: 'out', label: 'is a member of', group: 'Member of' },
  { id: 'MEMBER_OF:in', type: 'MEMBER_OF', dir: 'in', label: 'has as a member organization', group: 'Member organizations' },
  { id: 'AFFILIATED_WITH:out', type: 'AFFILIATED_WITH', dir: 'out', label: 'is affiliated with', group: 'Affiliations' },
  { id: 'CONNECTED_TO:out', type: 'CONNECTED_TO', dir: 'out', label: 'is connected to', group: 'Connections' },
];
export const orgLinkGroup = (l) => ORG_LINK_KINDS.find((k) => k.type === l.linkType && (k.dir === l.direction || l.linkType === 'AFFILIATED_WITH' || l.linkType === 'CONNECTED_TO'))?.group || 'Connections';
