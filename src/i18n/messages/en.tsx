import type { ReactNode } from 'react'

const s = (n: number, word: string, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`

/**
 * Every user-facing string, in English. This object's shape is the
 * `Messages` type every other language must match exactly — a missing key
 * or a different parameter list is a compile error, not a runtime blank.
 * Strings that take values are functions. The Debug tools panel and the
 * temporary ?perf=1 overlay are developer tools and stay English-only.
 */
export const en = {
  nav: {
    shopping: 'Shopping List',
    history: 'History',
    stats: 'Stats',
    customize: 'Customize',
    home: 'Home',
    about: 'About',
  },

  common: {
    add: 'Add',
    cancel: 'Cancel',
    dismiss: 'Dismiss',
    yesDelete: 'Yes, delete',
    essential: 'essential',
    nonEssential: 'non-essential',
    total: (price: string) => `Total: ${price}`,
    remove: (name: string) => `Remove ${name}`,
  },

  categories: {
    produce: 'Produce',
    dairy: 'Dairy',
    meat_seafood: 'Meat & Seafood',
    bakery: 'Bakery',
    frozen: 'Frozen',
    pantry: 'Pantry / Dry Goods',
    household: 'Household',
    personal_care: 'Personal Care',
    snacks: 'Snacks',
    drinks: 'Drinks',
    other: 'Other',
  },

  home: {
    cta: "I'm ready to shop",
  },

  footer: {
    mascotAlt: 'Grocery Buddy mascot',
  },

  shopping: {
    title: 'Shopping List',
    saveTrip: 'Save trip',
    loadingTrip: 'Loading trip…',
    unprocessedHint: (n: number) =>
      n === 1 ? 'Process or remove the receipt photo first' : `Process or remove the ${n} receipt photos first`,
    unprocessedTitle: (hint: string) => `${hint} — otherwise it would never be scanned`,
    reviewHint: 'Resolve the receipt review first',
    reviewTitle: 'Resolve the receipt review below before saving this trip',
    saveFailed: (message: string) => `Trip not saved: ${message}`,
    hideList: 'Hide shopping list',
    showList: 'Show shopping list',
    addPlaceholder: 'Add an item…',
    itemNameLabel: 'Item name',
    empty: "No items yet — add what you're picking up.",
    markGrabbed: (name: string) => `Mark ${name} as grabbed`,
    markNotGrabbed: (name: string) => `Mark ${name} as not grabbed`,
    editItem: (name: string) => `Edit ${name}`,
  },

  capture: {
    title: 'Receipt',
    addPhoto: 'Add receipt photo',
    camera: 'Camera',
    gallery: 'Choose from Photos',
    waiting: 'Waiting for photo…',
    preparing: 'Preparing photo…',
    stopWaiting: 'Stop waiting for photo',
    empty: 'No receipts captured yet.',
    pickerUnavailable: 'The photo picker is not available — reload the app and try again.',
    photoNotSaved: (message: string) => `Photo not saved: ${message}`,
    status: {
      pending: 'Waiting to process',
      processing: 'Processing…',
      failed: 'Failed — will retry',
      done: 'Processed',
    },
    retryingIn: (seconds: number) => `Retrying in ${seconds}s`,
    demoMode: 'Demo mode',
    retry: 'Retry',
    process: 'Process',
    removeReceipt: 'Remove receipt',
    thumbnailAlt: 'Receipt thumbnail',
    noPhoto: 'no photo',
    noPhotoTitle: 'Photo not kept in the backup this receipt was restored from',
    unreadablePhoto: (type: string, sizeMb: string, detail: string) => `Couldn't read this photo (${type}, ${sizeMb} MB): ${detail}`,
    unknownType: 'unknown type',
    canvasUnsupported: 'Canvas is not supported in this browser',
    encodeFailed: (width: number, height: number) => `Failed to encode the ${width}x${height} photo as JPEG`,
  },

  extractionErrors: {
    demo: 'Receipt scanning is disabled in this public demo. This is a personal project — check the README to run it with your own API key.',
    truncated: 'Receipt has too many items to process at once — try splitting it into two photos',
    tokenLimit: 'Receipt image too large for current plan — try a clearer/smaller photo',
    rateLimited: 'Too many requests — retrying automatically',
    unreadable: "Couldn't read this receipt — try again",
    connection: 'Connection issue — try again',
    generic: 'Something went wrong — try again',
  },

  review: {
    titleMatches: 'Review your scan',
    titleFound: "Here's what we found",
    confirm: 'Confirm',
    dismiss: 'Dismiss review',
    matchQuestion: (typed: ReactNode, scanned: ReactNode, price: string): ReactNode => (
      <>
        Is {typed} the same as {scanned} ({price})?
      </>
    ),
    yesSame: 'Yes, same item',
    noKeepBoth: 'No, keep both',
    date: (date: string) => `Date: ${date}`,
    dateUnreadable: (detail: string) =>
      `Couldn't read the receipt's date (${detail}) — the trip keeps its current date unless you pick one under Show items.`,
    dateSaveFailed: (message: string) => `Failed to save the date: ${message}`,
    hideItems: 'Hide items ▾',
    showItems: 'Show items ▸',
    purchaseDate: 'Purchase date',
    priceFor: (name: string) => `Price for ${name}`,
  },

  history: {
    title: 'History',
    empty: 'No saved trips yet.',
    filterByMonth: 'Filter by month:',
    allMonths: 'All months',
    tripSummary: (itemCount: number, price: string) => `${s(itemCount, 'item')} — ${price}`,
  },

  tripDetail: {
    back: '← Back to history',
    deleteTrip: 'Delete trip',
    confirmDeleteTrip: "Delete this trip? This can't be undone.",
    loading: 'Loading…',
    selected: (n: number) => `${n} selected`,
    delete: 'Delete',
    confirmBulkDelete: (n: number) => `Delete these ${s(n, 'item')}? This can't be undone.`,
    confirmItemDelete: (name: string) => `Delete "${name}"?`,
    markAs: (name: string, essential: boolean) => `Mark ${name} as ${essential ? 'non-essential' : 'essential'}`,
  },

  backup: {
    title: 'Backup & restore',
    intro: 'Your trips and history live only on this device. Export a backup before clearing browser data, uninstalling, or switching phones.',
    exportData: 'Export data',
    exporting: 'Exporting…',
    importData: 'Import data',
    exportFailed: (message: string) => `Export failed: ${message}`,
    importFailed: (message: string) => `Import failed: ${message}`,
    confirmRestore: (fileName: string, summary: string): ReactNode => (
      <>
        Restore <strong>{fileName}</strong>? It contains {summary}. Any existing trip, item, note, or receipt with a
        matching id will be overwritten — this can't be undone.
      </>
    ),
    restoring: 'Restoring…',
    yesRestore: 'Yes, restore',
    restored: (summary: string, fileName: string) => `Restored ${summary} from ${fileName}.`,
    summary: (c: { trips: number; items: number; notes: number; receipts: number; withPhotos: number }) =>
      `${s(c.trips, 'trip')}, ${s(c.items, 'item')}, ${s(c.notes, 'note')}, ${s(c.receipts, 'receipt')} (${c.withPhotos} with ${c.withPhotos === 1 ? 'photo' : 'photos'})`,
    errors: {
      notJson: (detail: string) => `That file is not valid JSON (${detail}).`,
      notObject: 'That file is not a Grocery Buddy backup (expected a JSON object at the top level).',
      noSchemaVersion: 'That file is missing a schemaVersion — it is not a Grocery Buddy backup file.',
      newerSchema: (fileVersion: number, supported: number) =>
        `That backup was made by a newer version of Grocery Buddy (schema v${fileVersion}) than this app supports (v${supported}). Update the app, then try importing again.`,
      noTables: 'That file is missing its "tables" section — it is not a valid Grocery Buddy backup file.',
      badTable: (key: string) => `That file's "${key}" table is missing or malformed — it is not a valid Grocery Buddy backup file.`,
      receiptNotObject: (entry: number) => `Receipt entry ${entry} in that file is not an object — the backup is damaged. Nothing was imported.`,
      receiptLabel: (id: string) => `Receipt #${id}`,
      unknownStatus: (label: string, status: string) => `${label} has an unknown status (${status}) — the backup is damaged. Nothing was imported.`,
      missingPhoto: (label: string, status: string) =>
        `${label} (${status}) has no photo, so it could never be processed after restoring — the backup is incomplete or damaged. Nothing was imported.`,
      invalidPhoto: (label: string) =>
        `${label}'s photo is not a valid image (expected a base64 "data:image/…" URL) — the backup is damaged. Nothing was imported.`,
      photoNotDataUrl: (id: string) => `Receipt #${id}'s photo is not an image data URL — nothing was imported.`,
      photoUndecodable: (id: string, status: number) => `Receipt #${id}'s photo could not be decoded (${status}) — nothing was imported.`,
      photoNotImage: (id: string, bytes: number, type: string) =>
        `Receipt #${id}'s photo decoded to ${bytes} bytes of ${type}, not an image — nothing was imported.`,
      exportMissingPhoto: (id: number, status: string) =>
        `Receipt #${id} (${status}) has no photo — it can't be processed, so it can't be backed up as-is.`,
    },
  },

  saveTripErrors: {
    unfinishedReceipts: (count: number, detail: string) =>
      `Can't save this trip yet — ${count} receipt(s) still need processing or review: ${detail}`,
    reviewOpen: ', review open',
  },

  cleanup: {
    freed: (mb: string, removed: number) =>
      `Freed ${mb} MB: removed ${s(removed, 'receipt photo')} from saved trips — they're no longer needed once a trip is saved.`,
    keptUnfinished: (n: number) =>
      `Left ${s(n, 'receipt')} on saved trips untouched, because ${n === 1 ? 'it was' : 'they were'} never fully processed.`,
    failed: (message: string) =>
      `Couldn't clear old receipt photos: ${message}. Nothing was deleted — it will try again next time the app opens.`,
  },

  stats: {
    title: 'Stats',
    noTrips: 'No completed trips yet — save a trip to see stats.',
    month: 'Month:',
    noTripsThisMonth: 'No completed trips for this month.',
    totalSpend: 'Total spend',
    essentialVsNon: 'Essential vs. non-essential',
    essential: 'Essential',
    nonEssential: 'Non-essential',
    byCategory: 'Spend by category',
    noItemsThisMonth: 'No purchased items this month.',
  },

  customize: {
    title: 'Customize',
    intro: 'Add personal notes on items that are NOT essential for you, within each category.',
    notesEmpty: "Nothing set up yet — add what's not essential for you.",
    notePlaceholder: 'e.g. nuggets, frozen pizza',
    addNoteFor: (category: string) => `Add a note for ${category}`,
    removeNote: (text: string) => `Remove note: ${text}`,
  },

  about: {
    features: [
      'Build your shopping list before or during a trip, checking items off as you grab them.',
      'Scan a receipt (camera or gallery) — AI pulls out items, prices, and categories.',
      'Review and confirm each scan — nothing touches your list until you do.',
      'Browse your trip history, grouped by month; edit or delete a leftover item, or a whole trip.',
      'See monthly stats: essential vs. non-essential spend, and spend by category.',
      'Personalize what counts as essential per category on Customize.',
      'Back up everything to a file, and restore it on a new device.',
    ] as readonly string[],
    access: 'Production access is protected behind a shared login.',
    planned: 'Planned: trends over time / month-to-month spending comparisons.',
  },
}

export type Messages = typeof en
