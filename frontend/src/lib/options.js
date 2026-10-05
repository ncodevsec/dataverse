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

export const ENTITY_TYPES = [
  { id: 'HUMAN', label: 'Human', plural: 'People', icon: 'user' },
  { id: 'FAMILY', label: 'Family', plural: 'Families', icon: 'users' },
  { id: 'GROUP', label: 'Group', plural: 'Groups', icon: 'users' },
  { id: 'ORGANIZATION', label: 'Organization', plural: 'Organizations', icon: 'building' },
  { id: 'POLITICAL_PARTY', label: 'Political party', plural: 'Political parties', icon: 'shield' },
  { id: 'OTHER', label: 'Other', plural: 'Other', icon: 'link' },
];
export const entityLabel = (id) => ENTITY_TYPES.find((t) => t.id === id)?.label || 'Human';

/** How a link reads from the viewed profile's point of view. dir 'out': this -> other, 'in': other -> this. */
export const LINK_KINDS = [
  { id: 'MEMBER_OF:out', type: 'MEMBER_OF', dir: 'out', label: 'is a member of', group: 'Memberships' },
  { id: 'MEMBER_OF:in', type: 'MEMBER_OF', dir: 'in', label: 'has as a member', group: 'Members' },
  { id: 'SUB_UNIT_OF:out', type: 'SUB_UNIT_OF', dir: 'out', label: 'is a sub-unit of', group: 'Part of' },
  { id: 'SUB_UNIT_OF:in', type: 'SUB_UNIT_OF', dir: 'in', label: 'has as a sub-unit', group: 'Sub-units' },
  { id: 'AFFILIATED_WITH:out', type: 'AFFILIATED_WITH', dir: 'out', label: 'is affiliated with', group: 'Affiliations' },
  { id: 'AFFILIATED_WITH:in', type: 'AFFILIATED_WITH', dir: 'in', label: 'is affiliated with', group: 'Affiliations' },
  { id: 'CONNECTED_TO:out', type: 'CONNECTED_TO', dir: 'out', label: 'is connected to', group: 'Connections' },
  { id: 'CONNECTED_TO:in', type: 'CONNECTED_TO', dir: 'in', label: 'is connected to', group: 'Connections' },
];
export const linkGroup = (l) => LINK_KINDS.find((k) => k.type === l.linkType && k.dir === l.direction)?.group || 'Connections';
