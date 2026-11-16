const assert = require('node:assert/strict');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const {
  createBalanceStore,
  formatBalance,
  parseAmount,
  runAccountingApp,
} = require('../index');

async function runApplication(script) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');

  let transcript = '';
  output.on('data', (chunk) => {
    transcript += chunk;
  });

  const application = runAccountingApp({ input, output });
  input.end(script);
  await application;

  const outputEnded = once(output, 'end');
  output.end();
  await outputEnded;

  return transcript;
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

test('TC-001: displays the menu and prompts for a choice at startup', async () => {
  const transcript = await runApplication('4\n');

  for (const option of [
    'Account Management System',
    '1. View Balance',
    '2. Credit Account',
    '3. Debit Account',
    '4. Exit',
    'Enter your choice (1-4): ',
  ]) {
    assert.ok(transcript.includes(option), `Expected menu to include "${option}".`);
  }
});

test('TC-002: displays the initial balance', async () => {
  const transcript = await runApplication('1\n4\n');

  assert.ok(transcript.includes('Current balance: 001000.00'));
});

test('TC-003: credits the balance and reads back the updated value', async () => {
  const transcript = await runApplication('2\n125.50\n1\n4\n');

  assert.ok(transcript.includes('Amount credited. New balance: 001125.50'));
  assert.ok(transcript.includes('Current balance: 001125.50'));
});

test('TC-004: debits an amount less than the balance', async () => {
  const transcript = await runApplication('3\n250.00\n1\n4\n');

  assert.ok(transcript.includes('Amount debited. New balance: 000750.00'));
  assert.ok(transcript.includes('Current balance: 000750.00'));
});

test('TC-005: accepts a debit equal to the balance', async () => {
  const transcript = await runApplication('3\n1000.00\n1\n4\n');

  assert.ok(transcript.includes('Amount debited. New balance: 000000.00'));
  assert.ok(transcript.includes('Current balance: 000000.00'));
});

test('TC-006: rejects an excessive debit without changing the balance', async () => {
  const transcript = await runApplication('3\n1000.01\n1\n4\n');

  assert.ok(transcript.includes('Insufficient funds for this debit.'));
  assert.ok(transcript.includes('Current balance: 001000.00'));
});

test('TC-007: applies sequential transactions to the same balance', async () => {
  const transcript = await runApplication('2\n100.00\n3\n25.00\n1\n4\n');

  assert.ok(transcript.includes('Amount credited. New balance: 001100.00'));
  assert.ok(transcript.includes('Amount debited. New balance: 001075.00'));
  assert.ok(transcript.includes('Current balance: 001075.00'));
});

test('TC-008: reports an invalid menu choice and continues without changing balance', async () => {
  const transcript = await runApplication('9\n1\n4\n');

  assert.ok(transcript.includes('Invalid choice, please select 1-4.'));
  assert.ok(countOccurrences(transcript, 'Account Management System') >= 2);
  assert.ok(transcript.includes('Current balance: 001000.00'));
});

test('TC-009: exits with a goodbye message without prompting for an amount', async () => {
  const transcript = await runApplication('4\n');

  assert.ok(transcript.includes('Exiting the program. Goodbye!'));
  assert.ok(!transcript.includes('Enter credit amount:'));
  assert.ok(!transcript.includes('Enter debit amount:'));
  assert.equal(countOccurrences(transcript, 'Account Management System'), 1);
});

test('TC-010: validates transaction amounts and prevents balance overflow', async () => {
  const input = [
    '2', '-0.01', 'not-a-number', '1000000.00', '1.234', '0',
    '3', '-0.01', 'not-a-number', '1000000.00', '1.234', '0',
    '2', '10.00',
    '3', '10.00',
    '1', '4',
  ].join('\n') + '\n';
  const transcript = await runApplication(input);

  assert.equal(countOccurrences(transcript, 'Invalid amount.'), 8);
  assert.ok(transcript.includes('Amount credited. New balance: 001000.00'));
  assert.ok(transcript.includes('Amount credited. New balance: 001010.00'));
  assert.equal(countOccurrences(transcript, 'Amount debited. New balance: 001000.00'), 2);
  assert.ok(transcript.includes('Current balance: 001000.00'));

  const overflowTranscript = await runApplication('2\n999000.00\n1\n4\n');
  assert.ok(overflowTranscript.includes('Credit would exceed the maximum supported balance.'));
  assert.ok(overflowTranscript.includes('Current balance: 001000.00'));
});

test('TC-011: starts a new application session with the initial balance', async () => {
  const firstSession = await runApplication('2\n10.00\n4\n');
  const restartedSession = await runApplication('1\n4\n');

  assert.ok(firstSession.includes('Amount credited. New balance: 001010.00'));
  assert.ok(restartedSession.includes('Current balance: 001000.00'));
});

test('amount parser uses cents and rejects unsupported formats and ranges', () => {
  assert.equal(parseAmount('125.50'), 12_550);
  assert.equal(parseAmount('5.5'), 550);
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount('-1.00'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount('1000000.00'), null);
});

test('balance store keeps integer cents within the supported range', () => {
  const store = createBalanceStore();

  assert.equal(store.read(), 100_000);
  store.write(107_550);
  assert.equal(store.read(), 107_550);
  assert.equal(formatBalance(99_999_999), '999999.99');
  assert.throws(() => store.write(-1), RangeError);
  assert.throws(() => store.write(100_000_000), RangeError);
});
