// Runs before the first paint (app/layout.tsx), so a hidden side menu doesn't flash open and then close.
// Kept apart from nav-toggle.tsx: a server component can't read plain values out of a "use client" file.
export const NAV_KEY = "nav";
export const NAV_SCRIPT = `try{if(localStorage.getItem("${NAV_KEY}")==="hidden")document.documentElement.dataset.nav="hidden"}catch(e){}`;
