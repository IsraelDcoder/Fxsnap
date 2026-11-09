const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getPaywallReminder,
  getPaywallReminderCount,
} = require('./paywallReminderPolicy');

test('paywall reminder sequence contains nine opt-in messages with no false expiry claims', () => {
  assert.equal(getPaywallReminderCount(), 9);
  for (let step = 0; step < getPaywallReminderCount(); step += 1) {
    const reminder = getPaywallReminder(step);
    assert.equal(reminder.route, '/paywall');
    assert.equal(reminder.type, 'paywall-reminder');
    assert.doesNotMatch(`${reminder.title} ${reminder.body}`, /countdown|expires today|last chance|limited.time/i);
  }
  assert.equal(getPaywallReminder(-1), null);
  assert.equal(getPaywallReminder(9), null);
});
