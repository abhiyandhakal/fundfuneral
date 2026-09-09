package com.fundfuneral;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.uimanager.ViewManager;
import java.util.*;
public class FundPackage implements ReactPackage {
  public List<NativeModule> createNativeModules(ReactApplicationContext c) {
    return Arrays.asList(new FundNative(c));
  }
  public List<ViewManager> createViewManagers(ReactApplicationContext c) {
    return Collections.emptyList();
  }
}
