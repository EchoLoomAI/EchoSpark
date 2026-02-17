
import React, { useState, useEffect } from 'react';
import { AppStep, UserProfile } from './types';
import SplashPage from './components/SplashPage';
import OnboardingStep1 from './components/OnboardingStep1';
import OnboardingStep2 from './components/OnboardingStep2';
import OnboardingStep3 from './components/OnboardingStep3';
import OnboardingStep4 from './components/OnboardingStep4';
import LoginPage from './components/LoginPage';
import VoiceProfileCollection from './components/VoiceProfileCollection';
import Dashboard from './components/Dashboard';
import CasualChat from './components/CasualChat';
import InterviewChat from './components/InterviewChat';
import FamilyGallery from './components/FamilyGallery';
import UserMenu from './components/UserMenu';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SPLASH);
  const [user, setUser] = useState<UserProfile>({ phoneNumber: '' });

  useEffect(() => {
    if (currentStep === AppStep.SPLASH) {
      const timer = setTimeout(() => {
        setCurrentStep(AppStep.ONBOARDING_1);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  const handleNext = () => {
    switch (currentStep) {
      case AppStep.ONBOARDING_1:
        setCurrentStep(AppStep.ONBOARDING_2);
        break;
      case AppStep.ONBOARDING_2:
        setCurrentStep(AppStep.ONBOARDING_3);
        break;
      case AppStep.ONBOARDING_3:
        setCurrentStep(AppStep.ONBOARDING_4);
        break;
      case AppStep.ONBOARDING_4:
        setCurrentStep(AppStep.LOGIN);
        break;
      default:
        break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case AppStep.ONBOARDING_2:
        setCurrentStep(AppStep.ONBOARDING_1);
        break;
      case AppStep.ONBOARDING_3:
        setCurrentStep(AppStep.ONBOARDING_2);
        break;
      case AppStep.ONBOARDING_4:
        setCurrentStep(AppStep.ONBOARDING_3);
        break;
      case AppStep.LOGIN:
        setCurrentStep(AppStep.ONBOARDING_4);
        break;
      case AppStep.ONBOARDING_VOICE:
        setCurrentStep(AppStep.LOGIN);
        break;
      case AppStep.CASUAL_CHAT:
        setCurrentStep(AppStep.DASHBOARD);
        break;
      case AppStep.INTERVIEW_CHAT:
        setCurrentStep(AppStep.DASHBOARD);
        break;
      case AppStep.FAMILY_GALLERY:
        setCurrentStep(AppStep.DASHBOARD);
        break;
      case AppStep.USER_MENU:
        setCurrentStep(AppStep.DASHBOARD);
        break;
      default:
        break;
    }
  };

  const handleLoginSuccess = (phone: string, isNewUser: boolean) => {
    if (isNewUser) {
      setUser({ phoneNumber: phone });
      setCurrentStep(AppStep.ONBOARDING_VOICE);
      return;
    }
    let stored: Partial<UserProfile> | null = null;
    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(`echospark_user_profile_${phone}`);
        stored = raw ? JSON.parse(raw) : null;
      }
    } catch {}
    if (stored) {
      setUser({ phoneNumber: phone, ...stored });
    } else {
      setUser({ phoneNumber: phone });
    }
    setCurrentStep(AppStep.DASHBOARD);
  };

  const handleProfileComplete = (profile: Partial<UserProfile>) => {
    const merged = { ...user, ...profile };
    setUser(merged);
    try {
      if (typeof window !== 'undefined' && merged.phoneNumber) {
        const key = `echospark_user_profile_${merged.phoneNumber}`;
        window.localStorage.setItem(key, JSON.stringify(merged));
      }
    } catch {}
    setCurrentStep(AppStep.DASHBOARD);
  };

  const handleDashboardNavigate = (mode: 'casual' | 'interview' | 'gallery' | 'profile') => {
    if (mode === 'casual') {
      setCurrentStep(AppStep.CASUAL_CHAT);
    } else if (mode === 'interview') {
      setCurrentStep(AppStep.INTERVIEW_CHAT);
    } else if (mode === 'gallery') {
      setCurrentStep(AppStep.FAMILY_GALLERY);
    } else if (mode === 'profile') {
      setCurrentStep(AppStep.USER_MENU);
    }
  };

  const handleLogout = () => {
    setUser({ phoneNumber: '' });
    setCurrentStep(AppStep.LOGIN);
  };

  // 调试用的强制跳转函数 (已移除)

  return (
    <div className="w-full h-[100dvh] bg-white overflow-hidden relative">
      {currentStep === AppStep.SPLASH && <SplashPage />}
        {currentStep === AppStep.ONBOARDING_1 && <OnboardingStep1 onNext={handleNext} />}
        {currentStep === AppStep.ONBOARDING_2 && <OnboardingStep2 onNext={handleNext} onBack={handleBack} />}
        {currentStep === AppStep.ONBOARDING_3 && <OnboardingStep3 onNext={handleNext} onBack={handleBack} />}
        {currentStep === AppStep.ONBOARDING_4 && <OnboardingStep4 onNext={handleNext} onBack={handleBack} />}
        {currentStep === AppStep.LOGIN && <LoginPage onBack={handleBack} onLoginSuccess={handleLoginSuccess} />}
        {currentStep === AppStep.ONBOARDING_VOICE && (
          <VoiceProfileCollection onComplete={handleProfileComplete} />
        )}
        {currentStep === AppStep.DASHBOARD && (
          <Dashboard 
            user={user} 
            onNavigate={handleDashboardNavigate} 
          />
        )}
        {currentStep === AppStep.CASUAL_CHAT && (
          <CasualChat onBack={handleBack} />
        )}
        {currentStep === AppStep.INTERVIEW_CHAT && (
          <InterviewChat user={user} onBack={handleBack} />
        )}
        {currentStep === AppStep.FAMILY_GALLERY && (
          <FamilyGallery onBack={handleBack} />
        )}
        {currentStep === AppStep.USER_MENU && (
        <UserMenu user={user} onBack={handleBack} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;
