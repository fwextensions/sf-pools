// Kept out of the grid's client module so the page, a server component, can
// inline the script as a plain string.

// a <style> the page's inline script adds before the first paint when the url
// carries grid state, hiding the unfiltered prerendered grid until the
// filters land; see GRID_PENDING_SCRIPT
export const GRID_PENDING_STYLE_ID = "grid-pending";

// Runs before the prerendered grid paints. The HTML is the unfiltered week,
// so a shared link to a filtered view would show the wrong grid for as long
// as hydration takes. A <style> in the head rather than an attribute on a
// React element, so hydration finds nothing it didn't render. It lifts itself
// after a few seconds in case the script bundle never arrives.
export const GRID_PENDING_SCRIPT = `(function(){if(!/[?&](program|pools|cell)=/.test(location.search))return;var s=document.createElement("style");s.id="${GRID_PENDING_STYLE_ID}";s.textContent="[data-grid-root]{visibility:hidden}";document.head.appendChild(s);setTimeout(function(){s.remove&&s.remove()},4000)})()`;
