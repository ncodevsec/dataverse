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
