
import React, { useState, useEffect } from 'react';
import { sendCode, login } from '../services/api';

interface Props {
  onBack: () => void;
  onLoginSuccess: (phone: string, isNewUser: boolean) => void;
}

const LoginPage: React.FC<Props> = ({ onBack, onLoginSuccess }) => {
  const [countryCode, setCountryCode] = useState('+86');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [agreed, setAgreed] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer: number;
    if (countdown > 0) {
      timer = window.setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleOtpChange = (val: string, index: number) => {
    if (/^\d*$/.test(val) && val.length <= 1) {
      const newOtp = [...otp];
      newOtp[index] = val;
      setOtp(newOtp);

      if (val && index < 5) {
        const nextInput = document.getElementById(`otp-${index + 1}`);
        nextInput?.focus();
      }
    }
  };

  const fullPhone = `${countryCode}${phone}`;

  const handleSendOtp = async () => {
    if (phone.length === 11) {
      setIsSendingOtp(true);
      try {
        const res = await sendCode(fullPhone);
        if (res.data?.code) {
          // Auto-fill for mock provider
          console.log('Mock code:', res.data.code);
          const codeStr = res.data.code.toString();
          setOtp(codeStr.split(''));
        }
        setCountdown(60);
      } catch (error) {
        console.error('Failed to send OTP:', error);
        alert('发送验证码失败，请重试');
      } finally {
        setIsSendingOtp(false);
      }
    }
  };

  const handleSubmit = async () => {
    const code = otp.join('');
    if (agreed && phone.length === 11 && code.length === 6) {
      setIsLoggingIn(true);
      try {
        const res = await login(fullPhone, code);
        const isNewUser = !!res?.data?.autoRegistered;
        onLoginSuccess(fullPhone, isNewUser);
      } catch (error) {
        console.error('Login failed:', error);
        alert('登录失败，请检查验证码');
      } finally {
        setIsLoggingIn(false);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative font-sans">
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary/10 to-transparent -z-10"></div>
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary/5 rounded-full blur-3xl -z-10"></div>

      <header className="px-6 pt-12 pb-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
        </button>
        <span className="text-slate-400 font-bold text-sm">帮助中心</span>
      </header>

      <main className="flex-1 px-8 pt-4 flex flex-col">
        <div className="mb-12">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">欢迎回来</h1>
          <p className="text-slate-500 text-lg">开启您的声音传记之旅，留住珍贵记忆</p>
        </div>

        <div className="space-y-6">
          <div className="group transition-all">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">手机号码</label>
            <div className="relative flex items-center bg-slate-50 border-2 border-transparent group-focus-within:border-primary group-focus-within:bg-white rounded-2xl px-5 h-16 transition-all shadow-sm overflow-hidden">
              <div className="relative flex items-center shrink-0">
                <span className="text-xl font-black text-slate-900 font-condensed z-0 flex items-center gap-1">
                  {countryCode}
                  <span className="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                </span>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 font-sans"
                >
                  <option value="+86">+86 中国</option>
                  <option value="+1">+1 美国/加拿大</option>
                  <option value="+81">+81 日本</option>
                  <option value="+852">+852 中国香港</option>
                </select>
              </div>
              
              <div className="w-[1px] h-6 bg-slate-200 mx-3 shrink-0"></div>
              
              <input
                type="tel"
                maxLength={11}
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="flex-1 min-w-[8rem] text-xl font-bold bg-transparent border-none focus:ring-0 p-0 placeholder:text-slate-300 font-condensed tracking-wider"
              />
              
              {phone.length === 11 && (
                <button
                  onClick={handleSendOtp}
                  disabled={countdown > 0 || isSendingOtp}
                  className={`ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-black transition-all shrink-0 active:scale-95 ${
                    countdown > 0 
                      ? 'bg-slate-100 text-slate-400' 
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {isSendingOtp ? (
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  ) : countdown > 0 ? (
                    `${countdown}s`
                  ) : (
                    '获取验证码'
                  )}
                </button>
              )}
            </div>
          </div>

          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">验证码</label>
          <div className="flex justify-between gap-2 mb-8">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="tel"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, index)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digit && index > 0) {
                    const prevInput = document.getElementById(`otp-${index - 1}`);
                    prevInput?.focus();
                  }
                }}
                className={`w-12 h-16 rounded-2xl text-center text-2xl font-black transition-all font-condensed outline-none
                    ${digit ? 'bg-primary text-white shadow-lg shadow-primary/30 -translate-y-1' : 'bg-slate-100 text-slate-400 border-2 border-transparent focus:border-primary focus:bg-white'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 mb-8 group cursor-pointer" onClick={() => setAgreed(!agreed)}>
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${agreed ? 'bg-primary border-primary' : 'border-slate-300 group-hover:border-primary'}`}>
              {agreed && <span className="material-symbols-outlined text-white text-sm font-bold">check</span>}
            </div>
            <span className="text-sm text-slate-500 font-medium">
              我已阅读并同意 <span className="text-primary font-bold">服务条款</span> 和 <span className="text-primary font-bold">隐私政策</span>
            </span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!agreed || phone.length !== 11 || otp.some(d => !d) || isLoggingIn}
            className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg tracking-wide shadow-xl shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                登录中...
              </>
            ) : (
              <>
                开启旅程
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>

        <div className="my-10 flex items-center gap-4">
          <div className="flex-1 h-[1px] bg-slate-100"></div>
          <span className="text-slate-300 text-xs font-black uppercase tracking-[0.2em]">快捷方式</span>
          <div className="flex-1 h-[1px] bg-slate-100"></div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8">
          <button className="flex items-center justify-center gap-3 w-full h-16 bg-[#07C160] rounded-2xl active:scale-[0.98] transition-all hover:bg-[#06ae56] shadow-lg shadow-green-500/20">
            <span className="text-white font-black text-lg">微信一键登录</span>
          </button>
        </div>

        <p className="text-center text-slate-400 text-xs font-medium pb-8">
          遇到问题？ <span className="text-primary font-bold">联系客服</span>
        </p>
      </main>
    </div>
  );
};

export default LoginPage;
