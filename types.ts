
export enum AppStep {
  SPLASH = 'SPLASH',
  ONBOARDING_1 = 'ONBOARDING_1',
  ONBOARDING_2 = 'ONBOARDING_2',
  ONBOARDING_3 = 'ONBOARDING_3',
  ONBOARDING_4 = 'ONBOARDING_4',
  LOGIN = 'LOGIN',
  ONBOARDING_VOICE = 'ONBOARDING_VOICE',
  DASHBOARD = 'DASHBOARD',
  CASUAL_CHAT = 'CASUAL_CHAT',
  INTERVIEW_CHAT = 'INTERVIEW_CHAT',
  FAMILY_GALLERY = 'FAMILY_GALLERY',
  USER_MENU = 'USER_MENU'
}

export interface UserProfile {
  phoneNumber: string;
  nickname?: string;
  age?: number;
  gender?: string;
  birthplace?: string;
  birthTime?: string;
  occupation?: string;
  dialect?: string;
}
