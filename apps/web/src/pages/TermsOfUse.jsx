import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function TermsOfUse() {
  useEffect(() => { document.title = 'NutriLabs — Terms of Use'; }, []);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary-600 hover:text-primary-700">← Back to login</Link>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-8 prose prose-sm max-w-none">
          <h1 className="text-2xl font-bold text-neutral-800 mb-1">Terms of Use</h1>
          <p className="text-xs text-neutral-400 mb-6">Last updated: June 2025</p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">1. Acceptance</h2>
          <p className="text-sm text-neutral-600">
            By accessing or using NutriLabs you agree to these terms. If you do not agree, do not use
            the application.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">2. Use of the Application</h2>
          <p className="text-sm text-neutral-600">
            NutriLabs is provided for personal, household meal planning purposes. You are responsible
            for all activity that occurs under your account. You agree not to attempt to gain
            unauthorized access to any part of the system or its underlying infrastructure.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">3. Self-Hosted Software</h2>
          <p className="text-sm text-neutral-600">
            NutriLabs is self-hosted software. The administrator who operates this instance is
            responsible for maintaining its security, backups, and availability. Users are advised to
            keep their credentials secure and log out of shared devices.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">4. Disclaimer of Warranties</h2>
          <p className="text-sm text-neutral-600">
            NutriLabs is provided "as is" without warranty of any kind. Nutritional information
            displayed by the application is for informational purposes only and should not be used as
            a substitute for professional dietary advice.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">5. Limitation of Liability</h2>
          <p className="text-sm text-neutral-600">
            To the fullest extent permitted by law, the NutriLabs developers and administrators shall
            not be liable for any indirect, incidental, or consequential damages arising from your use
            of the application.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">6. Changes to Terms</h2>
          <p className="text-sm text-neutral-600">
            The administrator may update these terms at any time. Continued use of NutriLabs after
            changes constitutes acceptance of the revised terms.
          </p>
        </div>
      </div>
    </div>
  );
}
