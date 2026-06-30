import { useState, useEffect } from 'react';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import ProfilesTab from '../components/settings/ProfilesTab.jsx';
import CustodyTab from '../components/settings/CustodyTab.jsx';
import NutritionTab from '../components/settings/NutritionTab.jsx';
import PantryTab from '../components/settings/PantryTab.jsx';
import ConnectionsTab from '../components/settings/ConnectionsTab.jsx';
import PreferencesTab from '../components/settings/PreferencesTab.jsx';

const TABS = [
  { id: 'profiles', label: 'Profiles', Component: ProfilesTab },
  { id: 'custody', label: 'Custody', Component: CustodyTab },
  { id: 'nutrition', label: 'Nutrition', Component: NutritionTab },
  { id: 'pantry', label: 'Pantry', Component: PantryTab },
  { id: 'connections', label: 'Connections', Component: ConnectionsTab },
  { id: 'preferences', label: 'Preferences', Component: PreferencesTab },
];

function SettingsContent() {
  const [activeTab, setActiveTab] = useState('profiles');
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const { Component } = active;

  return (
    <div className="md:flex md:gap-6 min-h-0">
      {/* Desktop vertical tabs */}
      <nav className="hidden md:flex flex-col gap-1 w-44 flex-shrink-0">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`w-full text-left px-3 py-2.5 text-sm rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-50 text-primary-700'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Mobile horizontal scrollable tabs */}
      <div className="md:hidden mb-4 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-1 border-b border-neutral-100 min-w-max pb-0">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-w-0">
        <ErrorBoundary>
          <Component />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function Settings() {
  useEffect(() => {
    document.title = 'NutriLabs — Settings';
  }, []);

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-neutral-900 mb-6">Settings</h1>
        <SettingsContent />
      </div>
    </ErrorBoundary>
  );
}
