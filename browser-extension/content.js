// content.js - Runs on every page to extract title

// Report page title to background script
const pageData = {
  url: window.location.href,
  title: document.title,
  timestamp: new Date().toISOString()
};

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getPageInfo') {
    sendResponse(pageData);
  }
});

// Track time spent on page
let startTime = Date.now();
let maxScrollDepth = 0;

window.addEventListener('scroll', () => {
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  const scrollPercent = (scrollTop + clientHeight) / scrollHeight;
  maxScrollDepth = Math.max(maxScrollDepth, scrollPercent);
});

// When leaving page, report engagement
window.addEventListener('beforeunload', () => {
  const duration = Date.now() - startTime;

  chrome.runtime.sendMessage({
    type: 'pageEngagement',
    data: {
      url: pageData.url,
      duration,
      maxScrollDepth
    }
  });
});
