// Talks to the Apps Script backend over HTTPS. Uses text/plain content-type
// on POST to avoid a CORS preflight (OPTIONS) request, which Apps Script
// web apps don't handle.

const Api = {
  async call(action, payload) {
    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...(payload || {}) })
    });
    return res.json();
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

// ---- Simple session handling (sessionStorage) ----
const Session = {
  KEY: 'nsda_officer_session',
  save(officer, password) {
    sessionStorage.setItem(this.KEY, JSON.stringify({ ...officer, _pw: password }));
  },
  get() {
    const raw = sessionStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() { sessionStorage.removeItem(this.KEY); }
};
