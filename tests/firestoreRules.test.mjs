import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-portfolio-rules';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const environment = await initializeTestEnvironment({ projectId, firestore: { rules } });

try {
  const owner = environment.authenticatedContext('owner').firestore();
  const other = environment.authenticatedContext('other').firestore();
  const anonymous = environment.unauthenticatedContext().firestore();

  const protectedPaths = [
    'portfolios/owner/stocks/005930',
    'portfolios/owner/history/2026-10-08',
    'users/owner/portfolios/real',
    'users/owner/portfolios/real/holdings/005930',
    'users/owner/portfolios/real/holdingHistories/trade-1',
    'users/owner/portfolios/real/summary/current',
    'users/owner/portfolios/real/recurringInvestmentRules/rule-1',
    'users/owner/portfolios/real/recurringInvestmentExecutions/execution-1',
    'users/owner/portfolios/real/migrations/legacy',
  ];

  for (const path of protectedPaths) {
    await assertSucceeds(setDoc(doc(owner, path), { value: 1 }));
    await assertSucceeds(getDoc(doc(owner, path)));
    await assertSucceeds(updateDoc(doc(owner, path), { value: 2 }));
    await assertFails(getDoc(doc(other, path)));
    await assertFails(setDoc(doc(other, path), { value: 3 }));
    await assertFails(updateDoc(doc(other, path), { value: 3 }));
    await assertFails(deleteDoc(doc(other, path)));
    await assertFails(getDoc(doc(anonymous, path)));
    await assertFails(setDoc(doc(anonymous, path), { value: 3 }));
    await assertSucceeds(deleteDoc(doc(owner, path)));
  }

  await assertSucceeds(setDoc(doc(owner, protectedPaths[0]), { value: 1 }));
  await assertSucceeds(getDocs(collection(owner, 'portfolios/owner/stocks')));
  await assertFails(getDocs(collection(other, 'portfolios/owner/stocks')));
  await assertSucceeds(getDocs(collection(owner, 'users/owner/portfolios')));
  await assertFails(getDocs(collection(other, 'users/owner/portfolios')));
  await assertFails(getDoc(doc(owner, 'users/other/portfolios/real')));
  await assertFails(setDoc(doc(owner, 'users/other/portfolios/real'), { value: 1 }));
  await assertFails(setDoc(doc(owner, 'admin/settings'), { value: 1 }));

  assert.equal(protectedPaths.length, 9);
  process.stdout.write(
    'Firestore rules: owner allow, other/anonymous deny, and unknown path deny passed.\n',
  );
} finally {
  await environment.cleanup();
}
