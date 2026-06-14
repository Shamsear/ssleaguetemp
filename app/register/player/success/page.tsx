'use client'

import { useRouter } from 'next/navigation'

export default function PlayerRegistrationSuccess() {
  const router = useRouter()

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-2xl w-full mx-auto text-center relative z-10 font-mono">
        {/* Success Icon */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-green-500/[0.08] text-green-600 rounded-full flex items-center justify-center border border-green-500/20 shadow-md">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Success Message */}
        <h2 className="text-2xl font-extrabold text-slate-800 uppercase tracking-wider mb-2">Registration Successful!</h2>
        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider leading-relaxed mb-8">
          Your player registration has been successfully submitted. The committee admins will review your registration shortly.
        </p>

        {/* Next Steps */}
        <div className="bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl p-6 mb-8 text-left">
          <h3 className="text-xs uppercase font-extrabold text-slate-800 tracking-wider mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            What Happens Next?
          </h3>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs mr-3">1</div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Committee Review</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">Your registration will be reviewed and approved by the committee admins</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs mr-3">2</div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Team Assignment</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">You'll be assigned to a team and notified via email</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs mr-3">3</div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Season Start</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">Watch for season schedule and match details</p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-blue-50/60 border border-blue-200/30 text-blue-700 p-4 rounded-xl mb-6 text-left font-mono">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-[10px] uppercase font-bold leading-relaxed">
              <p className="font-extrabold mb-1">Important Reminder</p>
              <p>Keep an eye on your email for updates from the committee. If you don't receive confirmation within 48 hours, please contact the committee admins.</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => router.push('/')}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Return Home
        </button>

        {/* Contact Info */}
        <div className="mt-6">
          <p className="text-[10px] uppercase font-bold text-slate-400">
            Need assistance? Contact the committee admins
          </p>
        </div>
      </div>
    </div>
  )
}
