
import React, { useState, useEffect } from 'react';
import { AppStep, UserProfile } from './types';
import SplashPage from './components/SplashPage';
import OnboardingStep1 from './components/OnboardingStep1';
import OnboardingStep2 from './components/OnboardingStep2';
import OnboardingStep3 from './components/OnboardingStep3';
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
      case AppStep.LOGIN:
        setCurrentStep(AppStep.ONBOARDING_3);
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

  const handleLoginSuccess = (phone: string) => {
    setUser({ ...user, phoneNumber: phone });
    setCurrentStep(AppStep.ONBOARDING_VOICE);
  };

  const handleProfileComplete = (profile: Partial<UserProfile>) => {
    setUser(prev => ({ ...prev, ...profile }));
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

  // 调试用的强制跳转函数
  const debugNextStep = () => {
    const steps = Object.values(AppStep);
    const currentIndex = steps.indexOf(currentStep);
    const nextIndex = (currentIndex + 1) % steps.length;
    setCurrentStep(steps[nextIndex] as AppStep);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-200 relative">
      <button
        onClick={debugNextStep}
        className="fixed bottom-8 right-8 z-50 bg-slate-800/80 hover:bg-slate-900 text-white px-4 py-3 rounded-full shadow-lg backdrop-blur-md font-mono text-xs flex items-center gap-2 transition-all border border-white/10"
        title="跳到下一步 (Debug)"
      >
        <span className="material-symbols-outlined text-[16px]">bug_report</span>
        <span>Skip: {currentStep}</span>
      </button>

      <div className="w-full h-full max-w-md bg-white shadow-2xl overflow-hidden relative" style={{ height: '932px', maxHeight: '100vh' }}>
        {currentStep === AppStep.SPLASH && <SplashPage />}
        {currentStep === AppStep.ONBOARDING_1 && <OnboardingStep1 onNext={handleNext} />}
        {currentStep === AppStep.ONBOARDING_2 && <OnboardingStep2 onNext={handleNext} onBack={handleBack} />}
        {currentStep === AppStep.ONBOARDING_3 && <OnboardingStep3 onNext={handleNext} onBack={handleBack} />}
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
    </div>
  );
};

export default App;
