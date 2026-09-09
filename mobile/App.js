import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  StatusBar,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
const L = require('../core/ledger');
const N = NativeModules.FundNative;
const uid = () => N.uuid();
const logo = require('../assets/logo.png');
const colors = {
  bg: '#faf7f2',
  ink: '#342c31',
  muted: '#827477',
  wine: '#703c4b',
  line: '#e6ddd2',
  white: '#ffffff',
};
function Button({ title, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.wine }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Input({
  label,
  value,
  onChangeText,
  placeholder = '',
  numeric = false,
  multiline = false,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[
          styles.input,
          multiline && { minHeight: 90, textAlignVertical: 'top' },
        ]}
        value={String(value ?? '')}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#a09495"
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
        autoCapitalize="none"
        multiline={multiline}
      />
    </View>
  );
}
function Choice({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.input}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.body}>
          {options.find(o => o.value === value)?.label || 'Choose…'} ▾
        </Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.shade}>
          <View style={styles.picker}>
            <Text style={styles.h2}>{label}</Text>
            <ScrollView>
              {options.map((o, i) => (
                <Pressable
                  accessibilityRole="button"
                  key={o.value || i}
                  style={styles.option}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.body}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button title="Cancel" secondary onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
function AppContent() {
  const [state, setState] = useState(null),
    ref = useRef(null),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [tab, setTab] = useState('History'),
    [currency, setCurrency] = useState(''),
    [month, setMonth] = useState(L.today().slice(0, 7)),
    [filter, setFilter] = useState({}),
    [advanced, setAdvanced] = useState(false),
    [limit, setLimit] = useState(60);
  const [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [peer, setPeer] = useState({}),
    [deviceName, setDeviceName] = useState('Phone'),
    [invitation, setInvitation] = useState(''),
    [status, setStatus] = useState(
      'Sync when both devices are on the same Wi-Fi.',
    ),
    [importData, setImportData] = useState(null),
    [mapping, setMapping] = useState({}),
    [preview, setPreview] = useState(null),
    [includeDuplicates, setIncludeDuplicates] = useState(false);
  const error = e => Alert.alert('Fund Funeral', e.message || String(e));
  const run = async fn => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = async next => {
    await N.save(JSON.stringify(next));
    ref.current = next;
    setState(next);
  };
  useEffect(() => {
    run(async () => {
      let data = JSON.parse(await N.load());
      let s = data.state
        ? L.merge(L.initial(data.device, data.state.vault), data.state.events)
        : L.initial(data.device, uid());
      await save(s);
      setPeer(data.peer);
      setDeviceName(data.name);
      setCurrency(L.rows(s, 'currency')[0]?.id || '');
    });
  }, []);
  const rows = kind => (state ? L.rows(state, kind) : []);
  const currencies = rows('currency'),
    c = currencies.find(v => v.id === currency) || currencies[0],
    accounts = rows('account').filter(a => a.currency === c?.id);
  const fmt = n => (c ? L.money(n, c.digits) : '0');
  const summary = c ? L.summary(state, c.id, month) : null;
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const close = () => {
    setModal(null);
    setPreview(null);
  };
  function openCurrency() {
    setForm({ code: 'NPR', name: 'Nepalese rupee', digits: '2' });
    setModal('currency');
  }
  function openAccount(a) {
    if (!c) {
      openCurrency();
      return;
    }
    setForm(a ? { ...a, opening: fmt(a.opening) } : { name: '', opening: '0' });
    setModal('account');
  }
  function openEntry(e) {
    if (!accounts.length) {
      openAccount();
      return;
    }
    setForm(
      e
        ? {
            ...e,
            amount: fmt(e.amount),
            fee: fmt(e.fee),
            time: e.time || '',
            actual: '',
          }
        : {
            type: 'expense',
            account: accounts[0].id,
            to: accounts[1]?.id || '',
            amount: '',
            fee: '0',
            category: '',
            date: L.today(),
            time: '',
            description: '',
            actual: '',
          },
    );
    setModal('entry');
  }
  const saveForm = () =>
    run(async () => {
      let s = ref.current;
      if (modal === 'currency') {
        let code = form.code.trim().toUpperCase();
        if (L.rows(s, 'currency').some(x => x.code === code))
          throw Error('That currency already exists');
        const id = uid();
        s = L.mutate(
          s,
          'currency',
          { id, code, name: form.name.trim(), digits: Number(form.digits) },
          false,
          uid(),
        );
        await save(s);
        setCurrency(id);
      }
      if (modal === 'account')
        await save(
          L.mutate(
            s,
            'account',
            {
              id: form.id || uid(),
              name: form.name.trim(),
              currency: c.id,
              opening: L.parse(form.opening, c.digits),
            },
            false,
            uid(),
          ),
        );
      if (modal === 'entry') {
        let amount = L.parse(form.amount || '0', c.digits);
        if (form.type === 'adjustment' && !form.id && form.actual)
          amount = L.parse(form.actual, c.digits) - L.balance(s, form.account);
        const e = {
          id: form.id || uid(),
          type: form.type,
          account: form.account,
          to: form.type === 'transfer' ? form.to : null,
          amount,
          fee: ['expense', 'transfer'].includes(form.type)
            ? L.parse(form.fee || '0', c.digits)
            : 0,
          category: form.category.trim(),
          date: form.date.trim(),
          time: form.time.trim() || null,
          description: form.description,
        };
        await save(L.mutate(s, 'entry', e, false, uid()));
      }
      close();
    });
  function remove(kind, data) {
    Alert.alert(
      'Delete ' + kind + '?',
      'Its balance effects will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await save(L.mutate(ref.current, kind, data, true, uid()));
              close();
            }),
        },
      ],
    );
  }
  let history = [];
  try {
    history = c
      ? L.history(state, {
          ...filter,
          currency: c.id,
          min: filter.minText ? L.parse(filter.minText, c.digits) : undefined,
          max: filter.maxText ? L.parse(filter.maxText, c.digits) : undefined,
        })
      : [];
  } catch {}
  const categories = [
    ...new Set([
      'Food',
      'Transport',
      'Education',
      'Health',
      'Shopping',
      'Bills',
      'Entertainment',
      'Salary',
      'Donation',
      'Other',
      ...rows('category').map(e => e.name),
      ...rows('entry')
        .map(e => e.category)
        .filter(Boolean),
    ]),
  ];
  const conflicts = state ? L.conflicts(state) : [];
  const sync = () =>
    run(async () => {
      if (!peer.pin) throw Error('Pair a desktop first');
      setStatus('Finding your desktop…');
      let nearby = JSON.parse(await N.discover()),
        found = nearby.find(p => p.device === peer.device);
      let endpoint = found || peer;
      if (!found && !endpoint.host)
        throw Error('Open a sync session on your desktop first');
      // The remembered cursor is an optimization only. A retry resends harmless duplicates.
      let s = ref.current,
        request = {
          action: 'sync',
          device: s.device,
          vault: s.vault,
          clock: s.clock,
          events: L.changes(s, peer.clock || {}),
        };
      setStatus('Exchanging encrypted changes…');
      let response = JSON.parse(
        await N.exchange(
          endpoint.host,
          endpoint.port,
          peer.pin,
          JSON.stringify(request),
        ),
      );
      if (response.error) throw Error(response.error);
      if (response.vault !== s.vault || response.device !== peer.device)
        throw Error('Unexpected paired device');
      await save(L.merge(s, response.events));
      let updated = { ...peer, ...endpoint, clock: response.clock };
      await N.setPeer(JSON.stringify(updated));
      setPeer(updated);
      setStatus('Synced just now. Both devices are up to date.');
    });
  const pair = () =>
    run(async () => {
      let i = JSON.parse(invitation);
      if (i.format !== 'fund-funeral-pair' || i.version !== 1 || !i.secret)
        throw Error('Paste a current pairing invitation from the desktop');
      if (ref.current.events.length && !i.empty)
        throw Error(
          'Both devices already have records. Pair with an empty device; independent vaults are not merged.',
        );
      const s = ref.current;
      const targetVault = s.events.length ? s.vault : i.vault;
      let response = JSON.parse(
        await N.exchange(
          i.host,
          i.port,
          i.pin,
          JSON.stringify({
            action: 'pair',
            secret: i.secret,
            device: s.device,
            name: deviceName,
            vault: targetVault,
            clock: s.events.length ? s.clock : {},
            events: s.events.length ? s.events : [],
          }),
        ),
      );
      if (response.error) throw Error(response.error);
      if (response.vault !== targetVault) throw Error('Wrong vault');
      let next = L.merge(
        s.events.length ? s : L.initial(s.device, targetVault),
        response.events,
      );
      await save(next);
      let p = {
        host: i.host,
        port: i.port,
        pin: i.pin,
        device: response.device,
        name: i.name,
        clock: response.clock,
      };
      await N.setPeer(JSON.stringify(p));
      setPeer(p);
      setCurrency(L.rows(next, 'currency')[0]?.id || '');
      setInvitation('');
      setStatus('Paired successfully. Your records are ready.');
    });
  const pickImport = () =>
    run(async () => {
      if (!accounts.length) throw Error('Create an account first');
      let text = await N.pickFile();
      if (text === null) return;
      let parsed = L.csvParse(text),
        map = {};
      for (let key of [
        'date',
        'description',
        'amount',
        'type',
        'debit',
        'credit',
        'fee',
        'category',
        'time',
        'to_account',
      ])
        map[key] = parsed.headers.find(h => h.toLowerCase() === key) || '';
      setMapping(map);
      setImportData({ text, parsed, account: accounts[0].id });
      setPreview(null);
      setModal('import');
    });
  const backup = () =>
    run(async () => {
      await N.writeFile(
        'fund-funeral-' + L.today() + '.json',
        L.backup(ref.current),
      );
    });
  const restore = () =>
    run(async () => {
      let text = await N.pickFile();
      if (text === null) return;
      let next = L.restore(text, ref.current.device, uid());
      Alert.alert(
        'Restore backup?',
        'Replace this vault and forget paired devices? A safety backup will be kept on this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: () =>
              run(async () => {
                await N.safetyBackup(L.backup(ref.current));
                await save(next);
                await N.setPeer('{}');
                setPeer({});
                setCurrency(L.rows(next, 'currency')[0]?.id || '');
              }),
          },
        ],
      );
    });
  if (!state)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.wine} />
        <Text style={styles.body}>Opening your vault…</Text>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fund Funeral</Text>
          <Text style={styles.muted}>Your money, accounted for.</Text>
        </View>
        {busy && <ActivityIndicator color={colors.wine} />}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!c ? (
          <View style={styles.card}>
            <Text style={styles.h2}>A fresh start for your money</Text>
            <Text style={styles.body}>
              Keep a simple record of what comes in, what goes out, and where
              your money lives. Everything stays on your devices.
            </Text>
            <Button title="Start new · Add currency" onPress={openCurrency} />
            <Button
              title="Connect existing device"
              secondary
              onPress={() => setTab('Devices')}
            />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Choice
                  label="Currency"
                  value={c.id}
                  options={currencies.map(c => ({
                    value: c.id,
                    label: c.code,
                  }))}
                  onChange={setCurrency}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Month"
                  value={month}
                  onChangeText={setMonth}
                  placeholder="YYYY-MM"
                />
              </View>
            </View>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>TOTAL BALANCE · {c.code}</Text>
              <Text style={styles.balance}>{fmt(summary.balance)}</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceLabel}>Income</Text>
                  <Text style={styles.smallTotal}>{fmt(summary.income)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceLabel}>Expenses</Text>
                  <Text style={styles.smallTotal}>{fmt(summary.expense)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceLabel}>Fees</Text>
                  <Text style={styles.smallTotal}>{fmt(summary.fees)}</Text>
                </View>
              </View>
              <Text style={styles.balanceLabel}>
                Net {fmt(summary.net)} · Adjustments {fmt(summary.adjustment)}
              </Text>
            </View>
          </>
        )}
        {conflicts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.h2}>
              {conflicts.length} conflicts need your choice
            </Text>
            <Text style={styles.body}>
              Totals include a provisional version until you choose.
            </Text>
            <Button
              title="Resolve conflicts"
              onPress={() => setModal('conflicts')}
            />
          </View>
        )}
        {tab === 'History' && c && (
          <>
            <View style={styles.section}>
              <Text style={styles.h2}>Transactions</Text>
              <Button title="+ Add" onPress={() => openEntry()} />
            </View>
            <Input
              label="Search history"
              value={filter.text || ''}
              onChangeText={text => setFilter({ ...filter, text })}
              placeholder="Description, category or account"
            />
            <Button
              title={advanced ? 'Hide filters' : 'Filter transactions'}
              secondary
              onPress={() => setAdvanced(!advanced)}
            />
            {advanced && (
              <View style={styles.card}>
                <Choice
                  label="Account filter"
                  value={filter.account || ''}
                  options={[
                    { value: '', label: 'All accounts' },
                    ...accounts.map(a => ({ value: a.id, label: a.name })),
                  ]}
                  onChange={account => setFilter({ ...filter, account })}
                />
                <Choice
                  label="Type filter"
                  value={filter.type || ''}
                  options={[
                    '',
                    'expense',
                    'income',
                    'transfer',
                    'adjustment',
                  ].map(t => ({ value: t, label: t || 'All types' }))}
                  onChange={type => setFilter({ ...filter, type })}
                />
                <Choice
                  label="Category filter"
                  value={filter.category || ''}
                  options={[
                    { value: '', label: 'All categories' },
                    ...categories.map(x => ({ value: x, label: x })),
                  ]}
                  onChange={category => setFilter({ ...filter, category })}
                />
                {[
                  ['from', 'From date'],
                  ['until', 'Until date'],
                  ['minText', 'Minimum amount'],
                  ['maxText', 'Maximum amount'],
                ].map(([key, label]) => (
                  <Input
                    key={key}
                    label={label}
                    value={filter[key] || ''}
                    onChangeText={v => setFilter({ ...filter, [key]: v })}
                  />
                ))}
                <Button
                  title="Clear filters"
                  secondary
                  onPress={() => setFilter({})}
                />
              </View>
            )}
            {!history.length && (
              <View style={styles.card}>
                <Text style={styles.h2}>Nothing recorded here yet</Text>
                <Text style={styles.body}>
                  Add a transaction or import a statement to begin.
                </Text>
              </View>
            )}
            {history.slice(0, limit).map(t => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={
                  'Edit ' + (t.category || t.type) + ' ' + fmt(t.amount)
                }
                style={styles.transaction}
                onPress={() => openEntry(t)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.transactionTitle}>
                    {t.category || t.type}
                  </Text>
                  <Text style={styles.muted}>
                    {L.get(state, 'account', t.account).name}
                    {t.to ? ' → ' + L.get(state, 'account', t.to).name : ''}
                  </Text>
                  <Text style={styles.muted}>
                    {t.date}
                    {t.time ? ' · ' + t.time : ''} · {t.type}
                  </Text>
                  {!!t.description && (
                    <Text style={styles.body}>{t.description}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      styles.amount,
                      { color: t.type === 'income' ? '#3b755e' : colors.wine },
                    ]}
                  >
                    {t.type === 'expense'
                      ? '−'
                      : t.type === 'income'
                      ? '+'
                      : ''}
                    {fmt(t.amount)}
                  </Text>
                  {t.fee > 0 && (
                    <Text style={styles.muted}>Fee {fmt(t.fee)}</Text>
                  )}
                </View>
              </Pressable>
            ))}
            {history.length > limit && (
              <Button
                title="Show more"
                secondary
                onPress={() => setLimit(limit + 60)}
              />
            )}
          </>
        )}
        {tab === 'Accounts' && (
          <>
            <Text style={styles.h2}>Where your money lives</Text>
            {accounts.map(a => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={'Edit account ' + a.name}
                style={styles.card}
                onPress={() => openAccount(a)}
              >
                <Text style={styles.h2}>{a.name}</Text>
                <Text style={styles.accountBalance}>
                  {c.code} {fmt(L.balance(state, a.id))}
                </Text>
                <Text style={styles.muted}>
                  Opening balance {fmt(a.opening)}
                </Text>
              </Pressable>
            ))}
            <Button title="Add account" onPress={() => openAccount()} />
            <Button title="Add currency" secondary onPress={openCurrency} />
          </>
        )}
        {tab === 'Devices' && (
          <>
            <Text style={styles.h2}>Your connected devices</Text>
            <Text style={styles.body}>{status}</Text>
            {peer.pin ? (
              <View style={styles.card}>
                <Text style={styles.h2}>{peer.name || 'Desktop'}</Text>
                <Text style={styles.muted}>
                  Paired · Open a sync session on the desktop first.
                </Text>
                <Button title="Sync now" disabled={busy} onPress={sync} />
                <Button
                  title="Update connection QR"
                  secondary
                  onPress={() =>
                    run(async () => {
                      const text = await N.scanQr();
                      if (!text) return;
                      const i = JSON.parse(text);
                      if (
                        i.format !== 'fund-funeral-pair' ||
                        i.pin !== peer.pin ||
                        i.vault !== ref.current.vault
                      )
                        throw Error('This is not your paired desktop');
                      const updated = { ...peer, host: i.host, port: i.port };
                      await N.setPeer(JSON.stringify(updated));
                      setPeer(updated);
                      setStatus('Connection updated. Tap Sync now.');
                    })
                  }
                />
                <Button
                  title="Forget this device"
                  secondary
                  onPress={() =>
                    Alert.alert(
                      'Forget device?',
                      'You will need to pair again.',
                      [
                        { text: 'Cancel' },
                        {
                          text: 'Forget',
                          onPress: () =>
                            run(async () => {
                              await N.setPeer('{}');
                              setPeer({});
                            }),
                        },
                      ],
                    )
                  }
                />
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.h2}>Connect existing device</Text>
                <Text style={styles.body}>
                  On your desktop, open Devices → Pair new phone. Paste its
                  private invitation below. One device must have an empty vault.
                </Text>
                <Button
                  title="Scan pairing QR"
                  secondary
                  onPress={() =>
                    run(async () => {
                      const text = await N.scanQr();
                      if (text) setInvitation(text);
                    })
                  }
                />
                <Input
                  label="Pairing invitation"
                  value={invitation}
                  onChangeText={setInvitation}
                  multiline
                />
                <Button
                  title="Pair with desktop"
                  disabled={busy}
                  onPress={pair}
                />
              </View>
            )}
          </>
        )}
        {tab === 'Data' && (
          <>
            <Text style={styles.h2}>Import & backup</Text>
            <Text style={styles.body}>
              Catch up from a statement. Keep a complete copy of your records.
            </Text>
            <Button title="Import CSV" onPress={pickImport} />
            <Button
              title="Export filtered CSV"
              secondary
              onPress={() =>
                run(async () => {
                  if (!c) throw Error('Add a currency first');
                  await N.writeFile(
                    'fund-funeral.csv',
                    L.csvExport(ref.current, {
                      ...filter,
                      currency: c.id,
                      min: filter.minText
                        ? L.parse(filter.minText, c.digits)
                        : undefined,
                      max: filter.maxText
                        ? L.parse(filter.maxText, c.digits)
                        : undefined,
                    }),
                  );
                })
              }
            />
            <View style={styles.card}>
              <Text style={styles.h2}>A backup is more than a spreadsheet</Text>
              <Text style={styles.body}>
                Backups include the complete vault. Device private keys stay on
                the device.
              </Text>
              <Button title="Create backup" onPress={backup} />
              <Button title="Restore backup" secondary onPress={restore} />
            </View>
          </>
        )}
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>
          Saved locally · Fund Funeral 1.0.0
        </Text>
      </ScrollView>
      <View style={styles.tabs}>
        {['History', 'Accounts', 'Devices', 'Data'].map(t => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            key={t}
            style={[styles.tab, tab === t && styles.activeTab]}
            onPress={() => setTab(t)}
          >
            <Text
              style={[
                styles.tabText,
                tab === t && { color: colors.wine, fontWeight: '700' },
              ]}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!modal}
        animationType="slide"
        onRequestClose={() => {
          if (Keyboard.isVisible()) Keyboard.dismiss();
          else close();
        }}
      >
        <SafeAreaView style={styles.root}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.h2}>
                {
                  {
                    currency: 'Add currency',
                    account: 'Account',
                    entry: 'Transaction',
                    import: 'Import statement',
                    conflicts: 'Resolve conflicts',
                  }[modal]
                }
              </Text>
              <Button title="Close" secondary onPress={close} />
            </View>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {modal === 'currency' && (
                <>
                  <Input
                    label="Currency code"
                    value={form.code}
                    onChangeText={v => set('code', v)}
                  />
                  <Input
                    label="Currency name"
                    value={form.name}
                    onChangeText={v => set('name', v)}
                  />
                  <Choice
                    label="Decimal places"
                    value={form.digits}
                    options={['0', '1', '2', '3', '4'].map(v => ({
                      value: v,
                      label: v,
                    }))}
                    onChange={v => set('digits', v)}
                  />
                </>
              )}
              {modal === 'account' && (
                <>
                  <Text style={styles.muted}>Currency: {c.code}</Text>
                  <Input
                    label="Account name"
                    value={form.name}
                    onChangeText={v => set('name', v)}
                  />
                  <Input
                    label="Opening balance"
                    value={form.opening}
                    onChangeText={v => set('opening', v)}
                    numeric
                  />
                  {form.id && (
                    <Button
                      title="Delete account"
                      secondary
                      onPress={() =>
                        remove('account', L.get(state, 'account', form.id))
                      }
                    />
                  )}
                </>
              )}
              {modal === 'entry' && (
                <>
                  <Choice
                    label="Transaction type"
                    value={form.type}
                    options={[
                      'expense',
                      'income',
                      'transfer',
                      'adjustment',
                    ].map(t => ({ value: t, label: t }))}
                    onChange={v => set('type', v)}
                  />
                  <Choice
                    label="Account"
                    value={form.account}
                    options={accounts.map(a => ({
                      value: a.id,
                      label: a.name,
                    }))}
                    onChange={v => set('account', v)}
                  />
                  {form.type === 'transfer' && (
                    <Choice
                      label="To account"
                      value={form.to}
                      options={accounts
                        .filter(a => a.id !== form.account)
                        .map(a => ({ value: a.id, label: a.name }))}
                      onChange={v => set('to', v)}
                    />
                  )}
                  <Input
                    label={
                      form.type === 'adjustment'
                        ? 'Adjustment amount (signed)'
                        : 'Amount'
                    }
                    value={form.amount}
                    onChangeText={v => set('amount', v)}
                    numeric
                  />
                  {['expense', 'transfer'].includes(form.type) && (
                    <Input
                      label="Transaction fee"
                      value={form.fee}
                      onChangeText={v => set('fee', v)}
                      numeric
                    />
                  )}
                  {form.type === 'adjustment' && !form.id && (
                    <>
                      <Text style={styles.body}>
                        Current balance: {fmt(L.balance(state, form.account))}
                      </Text>
                      <Input
                        label="Actual balance (optional)"
                        value={form.actual}
                        onChangeText={v => set('actual', v)}
                        placeholder="Calculate adjustment automatically"
                        numeric
                      />
                    </>
                  )}
                  <Input
                    label="Category"
                    value={form.category}
                    onChangeText={v => set('category', v)}
                    placeholder="Type any category"
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {categories
                      .filter(
                        x =>
                          !form.category ||
                          x.toLowerCase().includes(form.category.toLowerCase()),
                      )
                      .map(cat => (
                        <Pressable
                          key={cat}
                          style={styles.chip}
                          onPress={() => set('category', cat)}
                        >
                          <Text style={styles.muted}>{cat}</Text>
                        </Pressable>
                      ))}
                  </ScrollView>
                  <Input
                    label="Date"
                    value={form.date}
                    onChangeText={v => set('date', v)}
                    placeholder="YYYY-MM-DD"
                  />
                  <Input
                    label="Time (optional)"
                    value={form.time}
                    onChangeText={v => set('time', v)}
                    placeholder="HH:MM or blank"
                  />
                  <Input
                    label="Description"
                    value={form.description}
                    onChangeText={v => set('description', v)}
                    multiline
                  />
                  {form.id && (
                    <Button
                      title="Delete transaction"
                      secondary
                      onPress={() =>
                        remove('entry', L.get(state, 'entry', form.id))
                      }
                    />
                  )}
                </>
              )}
              {['currency', 'account', 'entry'].includes(modal) && (
                <Button title="Save" disabled={busy} onPress={saveForm} />
              )}
              {modal === 'import' && importData && !preview && (
                <>
                  <Choice
                    label="Import into account"
                    value={importData.account}
                    options={accounts.map(a => ({
                      value: a.id,
                      label: a.name,
                    }))}
                    onChange={account =>
                      setImportData({ ...importData, account })
                    }
                  />
                  <Text style={styles.body}>
                    Map amount + type, or debit + credit. Dates must use
                    YYYY-MM-DD.
                  </Text>
                  {Object.keys(mapping).map(key => (
                    <Choice
                      key={key}
                      label={key + ' column'}
                      value={mapping[key]}
                      options={[
                        { value: '', label: 'Not mapped' },
                        ...importData.parsed.headers.map(h => ({
                          value: h,
                          label: h,
                        })),
                      ]}
                      onChange={v => setMapping({ ...mapping, [key]: v })}
                    />
                  ))}
                  <Button
                    title="Preview import"
                    onPress={() =>
                      run(async () => {
                        setPreview(
                          L.preview(
                            ref.current,
                            importData.text,
                            mapping,
                            importData.account,
                            uid,
                          ),
                        );
                        setIncludeDuplicates(false);
                      })
                    }
                  />
                </>
              )}
              {modal === 'import' && preview && (
                <>
                  <Text style={styles.h2}>Review {preview.length} rows</Text>
                  {preview.map(r => (
                    <View key={r.line} style={styles.card}>
                      <Text style={styles.transactionTitle}>
                        Row {r.line} ·{' '}
                        {r.error
                          ? 'Invalid'
                          : r.duplicate
                          ? 'Possible duplicate'
                          : 'Ready'}
                      </Text>
                      <Text style={styles.body}>
                        {r.error ||
                          r.entry.date +
                            ' · ' +
                            r.entry.type +
                            ' · ' +
                            fmt(r.entry.amount) +
                            '\n' +
                            r.entry.description}
                      </Text>
                    </View>
                  ))}
                  <Choice
                    label="Possible duplicates"
                    value={includeDuplicates ? 'include' : 'skip'}
                    options={[
                      { value: 'skip', label: 'Skip possible duplicates' },
                      { value: 'include', label: 'Import duplicates anyway' },
                    ]}
                    onChange={v => setIncludeDuplicates(v === 'include')}
                  />
                  <Button
                    title="Import reviewed rows"
                    disabled={busy || preview.some(r => r.error)}
                    onPress={() =>
                      run(async () => {
                        await save(
                          L.importRows(
                            ref.current,
                            preview,
                            includeDuplicates,
                            uid,
                          ),
                        );
                        close();
                      })
                    }
                  />
                </>
              )}
              {modal === 'conflicts' &&
                conflicts.map(conflict => (
                  <View key={conflict.key} style={styles.card}>
                    <Text style={styles.h2}>Choose the correct record</Text>
                    {conflict.versions.map(v => (
                      <View key={v.id} style={styles.card}>
                        <Text style={styles.body}>
                          {v.deleted ? 'Deleted record\n' : ''}
                          {L.describe(state, v)}
                        </Text>
                        <Button
                          title={
                            v.deleted ? 'Keep deletion' : 'Keep this version'
                          }
                          onPress={() =>
                            run(async () => {
                              await save(
                                L.resolve(
                                  ref.current,
                                  conflict.key,
                                  v.id,
                                  uid(),
                                ),
                              );
                            })
                          }
                        />
                      </View>
                    ))}
                  </View>
                ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: { width: 32, height: 45 },
  title: { fontSize: 25, fontWeight: '700', color: colors.ink },
  content: { padding: 22, paddingTop: 8, paddingBottom: 40, gap: 12 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 12, lineHeight: 19, color: colors.muted },
  row: { flexDirection: 'row', gap: 12 },
  field: { marginBottom: 7 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: colors.white,
    minHeight: 46,
  },
  button: {
    backgroundColor: colors.wine,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 4,
  },
  secondary: { backgroundColor: '#eee5dd' },
  buttonText: { fontSize: 14, fontWeight: '600', color: 'white' },
  card: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  balanceCard: {
    backgroundColor: colors.wine,
    padding: 23,
    borderRadius: 20,
    gap: 15,
    marginBottom: 8,
  },
  balanceLabel: { fontSize: 11, color: '#ead6d7', lineHeight: 18 },
  balance: { fontSize: 37, fontWeight: '700', color: 'white' },
  smallTotal: { fontSize: 16, fontWeight: '600', color: 'white' },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transaction: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 4,
  },
  amount: { fontSize: 17, fontWeight: '600' },
  accountBalance: { fontSize: 26, fontWeight: '600', color: colors.wine },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'white',
  },
  tab: { flex: 1, paddingVertical: 17, alignItems: 'center' },
  activeTab: { borderTopWidth: 3, borderTopColor: colors.wine, paddingTop: 14 },
  tabText: { fontSize: 12, color: colors.muted },
  modalHeader: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shade: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'center',
    padding: 24,
  },
  picker: {
    maxHeight: '75%',
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 20,
  },
  option: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  chip: {
    padding: 9,
    marginRight: 7,
    backgroundColor: '#eee5dd',
    borderRadius: 16,
  },
});
