import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  useEffect(() => { document.title = 'NutriLabs — Privacy Policy'; }, []);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary-600 hover:text-primary-700">← Back to login</Link>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-8 prose prose-sm max-w-none">
          <h1 className="text-2xl font-bold text-neutral-800 mb-1">Privacy Policy</h1>
          <p className="text-xs text-neutral-400 mb-6">Last updated: June 2025</p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">1. Overview</h2>
          <p className="text-sm text-neutral-600">
            NutriLabs is a self-hosted meal planning application. All data you enter — including meal plans,
            recipes, grocery lists, and profile information — is stored exclusively on your own server.
            NutriLabs does not transmit your personal data to any third-party analytics, advertising,
            or tracking services.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">2. Data We Collect</h2>
          <p className="text-sm text-neutral-600">
            NutriLabs stores only the data you explicitly provide: your email address and password (hashed),
            meal plans, recipes, grocery lists, budget entries, pantry inventory, and application settings.
            This data lives entirely within your self-hosted database.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">3. Third-Party Services</h2>
          <p className="text-sm text-neutral-600">
            Optional integrations (Spoonacular, USDA FoodData, Kroger, Ollama) are configured by the
            administrator. Requests to these services are made server-side from your own host. Review
            each provider's privacy policy for their data handling practices.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">4. Password Reset Emails</h2>
          <p className="text-sm text-neutral-600">
            If SMTP is configured, NutriLabs sends password reset emails through your specified mail
            server. No email content is stored beyond your own infrastructure.
          </p>

          <h2 className="text-base font-semibold text-neutral-700 mt-6 mb-2">5. Contact</h2>
          <p className="text-sm text-neutral-600">
            Questions about privacy should be directed to your NutriLabs administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
