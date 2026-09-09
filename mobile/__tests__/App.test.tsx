import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { NativeModules, Pressable, TextInput, Alert } from 'react-native';

let serial = 0,
  saved: any;
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
beforeEach(() => {
  serial = 0;
  saved = null;
  NativeModules.FundNative = {
    uuid: () => `test-${++serial}`,
    load: jest.fn(async () =>
      JSON.stringify({
        device: 'phone',
        name: 'Test phone',
        peer: {},
        state: null,
      }),
    ),
    save: jest.fn(async (text: string) => {
      saved = JSON.parse(text);
    }),
    setPeer: jest.fn(async () => true),
  };
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
// A real user path through the React Native forms and native persistence boundary.
test('create currency, account and expense from an empty installation', async () => {
  const App = require('../App').default;
  let app: any;
  await act(async () => {
    app = TestRenderer.create(<App />);
  });
  async function tap(label: string) {
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(saved).not.toBeNull();
    const button = app.root.findAll(
      (b: any) =>
        b.props.accessibilityLabel === label &&
        typeof b.props.onPress === 'function',
    )[0];
    expect(button).toBeDefined();
    await act(async () => {
      button.props.onPress();
    });
  }
  async function input(label: string, text: string) {
    const field = app.root
      .findAllByType(TextInput)
      .find((x: any) => x.props.accessibilityLabel === label);
    expect(field).toBeDefined();
    await act(async () => {
      field.props.onChangeText(text);
    });
  }
  await tap('Start new · Add currency');
  await tap('Save');
  expect(saved.events).toHaveLength(1);
  await tap('+ Add');
  await input('Account name', 'Cash');
  await input('Opening balance', '1000');
  await tap('Save');
  expect(saved.events).toHaveLength(2);
  await tap('+ Add');
  await input('Amount', '12.25');
  await input('Transaction fee', '0.25');
  await input('Category', 'Coffee');
  await tap('Save');
  expect(saved.events).toHaveLength(4);
  expect(saved.events[3].data.amount).toBe(1225);
  expect(saved.events[3].data.fee).toBe(25);
  expect(saved.events[3].data.time).toBeNull();
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => {
    app.unmount();
  });
});
