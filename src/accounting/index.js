const readline = require('node:readline/promises');

const INITIAL_BALANCE_CENTS = 100_000;
const MAX_BALANCE_CENTS = 99_999_999;

function createBalanceStore(initialBalanceCents = INITIAL_BALANCE_CENTS) {
  let balanceCents = initialBalanceCents;

  function validateBalance(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BALANCE_CENTS) {
      throw new RangeError('Balance must be between 0.00 and 999999.99.');
    }
  }

  validateBalance(balanceCents);

  return {
    read() {
      return balanceCents;
    },
    write(value) {
      validateBalance(value);
      balanceCents = value;
    },
  };
}

function parseAmount(input) {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) {
    return null;
  }

  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const amountCents = dollars * 100 + cents;

  if (!Number.isSafeInteger(amountCents) || amountCents > MAX_BALANCE_CENTS) {
    return null;
  }

  return amountCents;
}

function formatBalance(balanceCents) {
  const dollars = Math.floor(balanceCents / 100);
  const cents = String(balanceCents % 100).padStart(2, '0');
  return `${String(dollars).padStart(6, '0')}.${cents}`;
}

async function runAccountingApp({ input = process.stdin, output = process.stdout } = {}) {
  const terminal = readline.createInterface({ input, output });
  const lines = terminal[Symbol.asyncIterator]();
  const store = createBalanceStore();
  const display = (message) => output.write(`${message}\n`);

  async function ask(prompt) {
    output.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : value;
  }

  async function readAmount(action) {
    while (true) {
      const enteredAmount = await ask(`Enter ${action} amount: `);
      if (enteredAmount === null) {
        return null;
      }

      const amountCents = parseAmount(enteredAmount);

      if (amountCents !== null) {
        return amountCents;
      }

      display('Invalid amount. Enter a value from 0.00 to 999999.99 with up to two decimal places.');
    }
  }

  try {
    while (true) {
      display('--------------------------------');
      display('Account Management System');
      display('1. View Balance');
      display('2. Credit Account');
      display('3. Debit Account');
      display('4. Exit');
      display('--------------------------------');

      const enteredChoice = await ask('Enter your choice (1-4): ');
      if (enteredChoice === null) {
        break;
      }
      const choice = enteredChoice.trim();

      if (choice === '1') {
        display(`Current balance: ${formatBalance(store.read())}`);
      } else if (choice === '2') {
        const amountCents = await readAmount('credit');
        if (amountCents === null) {
          break;
        }
        const updatedBalance = store.read() + amountCents;

        if (updatedBalance > MAX_BALANCE_CENTS) {
          display('Credit would exceed the maximum supported balance.');
          continue;
        }

        store.write(updatedBalance);
        display(`Amount credited. New balance: ${formatBalance(store.read())}`);
      } else if (choice === '3') {
        const amountCents = await readAmount('debit');
        if (amountCents === null) {
          break;
        }
        const balance = store.read();

        if (balance >= amountCents) {
          store.write(balance - amountCents);
          display(`Amount debited. New balance: ${formatBalance(store.read())}`);
        } else {
          display('Insufficient funds for this debit.');
        }
      } else if (choice === '4') {
        break;
      } else {
        display('Invalid choice, please select 1-4.');
      }
    }

    display('Exiting the program. Goodbye!');
  } finally {
    terminal.close();
  }
}

if (require.main === module) {
  runAccountingApp().catch((error) => {
    console.error('Unable to run the account management application:', error);
    process.exitCode = 1;
  });
}

module.exports = { createBalanceStore, formatBalance, parseAmount, runAccountingApp };
