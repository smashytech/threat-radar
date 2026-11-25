// The Breaches page moved from /ransomware/ to /breaches/ (spec 003 amendment A1).
// Forward old links with their details: ?d= picks the issue, #trends the tab.
// Only the page's own query and fragment are carried over, to a fixed path on this site.
location.replace("../breaches/" + location.search + location.hash);
