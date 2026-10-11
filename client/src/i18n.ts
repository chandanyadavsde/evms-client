/** App words for the driver-facing screens. Flow labels come translated from the server. */
const WORDS = {
  onDuty: { en: 'On duty', hi: 'ड्यूटी पर' },
  signOut: { en: 'Sign out', hi: 'लॉग आउट' },
  noTrip: {
    en: "No trip assigned yet. You'll see it here as soon as the manager dispatches one.",
    hi: 'अभी कोई ट्रिप नहीं है। मैनेजर भेजते ही यहाँ दिखेगी।',
  },
  waitingManager: {
    en: 'Waiting for the manager to review this leg.',
    hi: 'मैनेजर इस यात्रा की जाँच कर रहे हैं।',
  },
  legOf: { en: 'Leg {a} of {b}', hi: 'यात्रा {a} / {b}' },
  uploading: { en: 'Uploading…', hi: 'अपलोड हो रहा है…' },
  uploaded: { en: 'Uploaded ✓', hi: 'अपलोड हो गया ✓' },
  uploadFailed: { en: 'Upload failed', hi: 'अपलोड नहीं हुआ' },
  saving: { en: 'Saving…', hi: 'सेव हो रहा है…' },
  clear: { en: 'Clear', hi: 'मिटाएँ' },
  useSignature: { en: 'Use signature', hi: 'हस्ताक्षर लगाएँ' },
  signatureSaved: { en: 'Signature saved ✓', hi: 'हस्ताक्षर सेव ✓' },
  select: { en: 'Select…', hi: 'चुनें…' },
  aiReads: { en: 'AI reads this', hi: 'AI पढ़ेगा' },
  aiExtracts: { en: 'AI extracts fields', hi: 'AI जानकारी निकालेगा' },
  farAway: {
    en: 'You appear to be {km} km from this location. You must be within {m} m.',
    hi: 'आप इस जगह से {km} किमी दूर लगते हैं। {m} मीटर के अंदर होना ज़रूरी है।',
  },
  tryAgain: { en: 'Something went wrong. Try again.', hi: 'कुछ गड़बड़ हुई। फिर से कोशिश करें।' },
  startShift: { en: 'Start shift', hi: 'शिफ्ट शुरू करें' },
  endShift: { en: 'End shift', hi: 'शिफ्ट खत्म करें' },
  shiftOn: { en: 'On shift', hi: 'शिफ्ट चालू' },
  lastReading: { en: 'Last reading', hi: 'पिछली रीडिंग' },
  odometerKm: { en: 'Odometer (km)', hi: 'ओडोमीटर (किमी)' },
  batteryPct: { en: 'Battery %', hi: 'बैटरी %' },
} as const;

export type WordKey = keyof typeof WORDS;

export function t(key: WordKey, lang = 'en', vars: Record<string, string | number> = {}): string {
  const w: Record<string, string> = WORDS[key];
  let s = w[lang] ?? w.en ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
