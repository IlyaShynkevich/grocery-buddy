import { useState, type ReactNode } from 'react'
import { CURRENCIES, isCurrency } from '../../i18n/currencies'
import { isLanguage, LANGUAGES } from '../../i18n/languages'
import { useT } from '../../i18n'
import { cardStyle, mutedTextStyle, pageStyle } from '../../lib/ui'
import { setCurrency, setLanguage, setTheme, useSettings } from '../../settings/settingsStore'
import { isTheme, THEMES } from '../../settings/theme'
import { Mascot } from '../mascot/Mascot'
import { TagIcon } from '../navigation/icons'

/** Label on the left, control on the right — one compact row per setting. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

const selectStyle = { minHeight: '2.5rem', minWidth: '9rem' }

/**
 * The app's configuration: language and currency (independent — the
 * currency only decides what new trips use), theme, and the way into
 * Customize.
 */
export function SettingsPage({ onOpenCustomize }: { onOpenCustomize: () => void }) {
  const messages = useT()
  const settings = useSettings()
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Applies a setting; if it can't be saved for next time, says so (it still applies now). */
  const apply = (change: () => void) => {
    setSaveError(null)
    try {
      change()
    } catch (err) {
      console.error('Grocery Buddy: could not save a setting', err)
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section data-testid="settings-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem' }}>{messages.settings.title}</h1>
        <Mascot pose="excited" size={32} />
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem' }}>
        <SettingRow label={messages.settings.language}>
          <select
            data-testid="settings-language"
            value={settings.language}
            onChange={(e) => {
              const value = e.target.value
              if (!isLanguage(value)) return console.error(`Grocery Buddy: unknown language picked: ${JSON.stringify(value)}`)
              apply(() => setLanguage(value))
            }}
            style={selectStyle}
          >
            {Object.values(LANGUAGES).map((option) => (
              <option key={option.language} value={option.language}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingRow>

        <div>
          <SettingRow label={messages.settings.currency}>
            <select
              data-testid="settings-currency"
              value={settings.currency}
              onChange={(e) => {
                const value = e.target.value
                if (!isCurrency(value)) return console.error(`Grocery Buddy: unknown currency picked: ${JSON.stringify(value)}`)
                apply(() => setCurrency(value))
              }}
              style={selectStyle}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {messages.settings.currencyOption(code)}
                </option>
              ))}
            </select>
          </SettingRow>
          <p data-testid="settings-currency-hint" style={{ ...mutedTextStyle, fontSize: '0.8rem', marginTop: '0.3rem' }}>
            {messages.settings.currencyHint}
          </p>
        </div>

        <SettingRow label={messages.settings.theme}>
          <select
            data-testid="settings-theme"
            value={settings.theme}
            onChange={(e) => {
              const value = e.target.value
              if (!isTheme(value)) return console.error(`Grocery Buddy: unknown theme picked: ${JSON.stringify(value)}`)
              apply(() => setTheme(value))
            }}
            style={selectStyle}
          >
            {THEMES.map((option) => (
              <option key={option} value={option}>
                {messages.settings.themeOptions[option]}
              </option>
            ))}
          </select>
        </SettingRow>

        {saveError && (
          <p role="alert" data-testid="settings-save-error" style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
            {messages.settings.saveFailed(saveError)}
          </p>
        )}
      </div>

      <button
        type="button"
        data-testid="settings-open-customize"
        onClick={onOpenCustomize}
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', marginTop: '0.75rem', minHeight: '2.75rem' }}
      >
        <TagIcon />
        <span style={{ flex: 1, textAlign: 'left' }}>{messages.settings.openCustomize}</span>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  )
}
