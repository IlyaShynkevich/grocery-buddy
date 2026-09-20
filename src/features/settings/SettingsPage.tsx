import { useState, type ReactNode } from 'react'
import { CURRENCIES, isCurrency } from '../../i18n/currencies'
import { isLanguage, LANGUAGES } from '../../i18n/languages'
import { useT } from '../../i18n'
import { footnoteStyle, listGroupStyle, listRowStyle, mutedTextStyle, pageStyle, space, subtleTextStyle } from '../../lib/ui'
import { setCurrency, setLanguage, setTheme, useSettings } from '../../settings/settingsStore'
import { isTheme, THEMES } from '../../settings/theme'
import { Mascot } from '../mascot/Mascot'
import { TagIcon } from '../navigation/icons'
import { BackupSection } from './BackupSection'
import { StorageSection } from './StorageSection'

/**
 * Label on the left, control on the right — one row of the grouped list
 * below. `padded` is off for the currency row, which is wrapped in a
 * container that carries the padding for both the row and its hint.
 */
function SettingRow({ label, children, padded = true }: { label: string; children: ReactNode; padded?: boolean }) {
  return (
    // The select is already a 40px tap target, so the row only needs
    // enough padding to separate it from the hairlines above and below.
    <label style={{ ...listRowStyle, justifyContent: 'space-between', gap: space.lg, padding: padded ? `${space.sm} ${space.lg}` : 0 }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

const selectStyle = { minHeight: '2.5rem', minWidth: '9rem' }

/**
 * The app's configuration: language and currency (independent — the
 * currency only decides what new trips use), theme, the way into
 * Customize, backup & restore, and how much space the app takes.
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
        <h1>{messages.settings.title}</h1>
        <Mascot pose="excited" size={32} />
      </div>

      <div className="gb-group" style={{ ...listGroupStyle, marginTop: space.lg }}>
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

        <div style={{ padding: `${space.sm} ${space.lg}` }}>
          <SettingRow label={messages.settings.currency} padded={false}>
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
          <p data-testid="settings-currency-hint" style={{ ...footnoteStyle, ...mutedTextStyle, marginTop: space.xs }}>
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
          <p role="alert" data-testid="settings-save-error" style={{ ...footnoteStyle, color: 'var(--danger)', padding: `0 ${space.lg} ${space.md}` }}>
            {messages.settings.saveFailed(saveError)}
          </p>
        )}
      </div>

      {/* Styled as a one-row group (surface fill, no border, chevron) rather
          than as a button-shaped button: it navigates, it doesn't act, and
          the chevron is what says so. */}
      <button
        type="button"
        data-testid="settings-open-customize"
        onClick={onOpenCustomize}
        style={{ ...listGroupStyle, ...listRowStyle, marginTop: space.lg, minHeight: '2.75rem', border: 'none' }}
      >
        <TagIcon />
        <span style={{ flex: 1, textAlign: 'left' }}>{messages.settings.openCustomize}</span>
        <span aria-hidden="true" style={subtleTextStyle}>
          ›
        </span>
      </button>

      <BackupSection />
      <StorageSection />
    </section>
  )
}
