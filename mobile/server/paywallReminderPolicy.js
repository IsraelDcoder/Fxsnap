const REMINDERS = [
  {
    title: 'Your FXSnap Pro plans are ready',
    body: 'Continue whenever you’re ready. Your subscription options are waiting in FXSnap.',
  },
  {
    title: 'A clearer view of your charts',
    body: 'Explore FXSnap Pro chart analysis, structured setups, and risk tools.',
  },
  {
    title: 'Plan your next setup with FXSnap',
    body: 'Your Pro tools are available whenever you want to take another look.',
  },
  {
    title: 'Make your chart review more structured',
    body: 'FXSnap Pro brings chart context and risk planning together.',
  },
  {
    title: 'Your trading toolkit is in FXSnap',
    body: 'Revisit the plans to see which FXSnap Pro option works for you.',
  },
  {
    title: 'Want to continue with FXSnap Pro?',
    body: 'Your subscription options are still available in the app.',
  },
  {
    title: 'Review your FXSnap subscription options',
    body: 'Take another look at the chart and risk tools available with Pro.',
  },
  {
    title: 'FXSnap Pro is here when you need it',
    body: 'Open the app to review plans for chart analysis and trade planning.',
  },
  {
    title: 'Take another look at FXSnap Pro',
    body: 'Your plan options are available in the app whenever you’re ready.',
  },
];

function getPaywallReminder(step) {
  if (!Number.isInteger(step) || step < 0 || step >= REMINDERS.length) return null;
  return {
    ...REMINDERS[step],
    type: 'paywall-reminder',
    route: '/paywall',
    channelId: 'fxsnap-retention',
  };
}

function getPaywallReminderCount() {
  return REMINDERS.length;
}

module.exports = {
  getPaywallReminder,
  getPaywallReminderCount,
};
