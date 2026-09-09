package com.fundfuneral;

import android.content.*;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.facebook.react.bridge.*;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeIntegrationTest {
 private static class TestReactContext extends ReactApplicationContext {
  TestReactContext(Context c){super(c);}
  public <T extends JavaScriptModule>T getJSModule(Class<T> c){return null;}
  public <T extends NativeModule>boolean hasNativeModule(Class<T> c){return false;}
  public java.util.Collection<NativeModule> getNativeModules(){return java.util.Collections.emptyList();}
  public <T extends NativeModule>T getNativeModule(Class<T> c){return null;}
  public NativeModule getNativeModule(String s){return null;}
  public CatalystInstance getCatalystInstance(){return null;}
  public boolean hasActiveCatalystInstance(){return false;}
  public boolean hasActiveReactInstance(){return false;}
  public boolean hasCatalystInstance(){return false;}
  public boolean hasReactInstance(){return false;}
  public RuntimeExecutor getRuntimeExecutor(){return null;}
  public void destroy(){}
  public void handleException(Exception e){throw new RuntimeException(e);}
  public boolean isBridgeless(){return true;}
  public JavaScriptContextHolder getJavaScriptContextHolder(){return null;}
  public com.facebook.react.turbomodule.core.interfaces.CallInvokerHolder getJSCallInvokerHolder(){return null;}
  public UIManager getFabricUIManager(){return null;}
  public String getSourceURL(){return null;}
  public void registerSegment(int id,String path,Callback callback){}
 }
 private String invoke(Consumer<Promise> action)throws Exception{
  CountDownLatch latch=new CountDownLatch(1);String[] output={null},error={null};
  Promise p=new PromiseImpl(args->{output[0]=String.valueOf(args[0]);latch.countDown();},args->{error[0]=java.util.Arrays.toString(args);latch.countDown();});
  action.accept(p);assertTrue("Native operation timed out",latch.await(30,TimeUnit.SECONDS));assertNull(error[0],error[0]);return output[0];
 }
 @Test public void nativeStorageAndPinnedTls()throws Exception{
  Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();String isolated="qa-"+UUID.randomUUID();
  // All database and preference writes go to test-owned files, never the user's vault.
  Context isolatedContext=new ContextWrapper(target){
   @Override public Context getApplicationContext(){return this;}
   @Override public SQLiteDatabase openOrCreateDatabase(String name,int mode,SQLiteDatabase.CursorFactory f){return SQLiteDatabase.openOrCreateDatabase(new File(getCacheDir(),isolated+".sqlite3"),f);}
   @Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences(isolated+"-"+name,mode);}
  };
  FundNative nativeApi=new FundNative(new TestReactContext(isolatedContext));
  JSONObject loaded=new JSONObject(invoke(p->nativeApi.load(p)));String device=loaded.getString("device");assertTrue(loaded.isNull("state"));
  String state="{\"format\":\"fund-funeral\",\"version\":1,\"device\":\""+device+"\",\"vault\":\"test-vault\",\"events\":[],\"heads\":{},\"clock\":{}}";
  invoke(p->nativeApi.save(state,p));JSONObject reopened=new JSONObject(invoke(p->nativeApi.load(p)));assertEquals("test-vault",reopened.getJSONObject("state").getString("vault"));assertEquals(device,reopened.getString("device"));
  String inviteText=InstrumentationRegistry.getArguments().getString("invitation");
  if(inviteText!=null){JSONObject i=new JSONObject(inviteText);String host=i.getString("host"),pin=i.getString("pin");int port=i.getInt("port");JSONObject request=new JSONObject();request.put("action","pair");request.put("device",device);request.put("name","Android instrumentation");request.put("secret",i.getString("secret"));request.put("vault",i.getString("vault"));request.put("clock",new JSONObject());
   JSONObject response=new JSONObject(invoke(p->nativeApi.exchange(host,port,pin,request.toString(),p)));assertFalse(response.toString(),response.has("error"));assertEquals(i.getString("vault"),response.getString("vault"));
  }
 }
}
