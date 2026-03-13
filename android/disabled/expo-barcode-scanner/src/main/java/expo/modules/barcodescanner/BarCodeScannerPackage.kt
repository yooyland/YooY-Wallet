package expo.modules.barcodescanner

import expo.modules.core.BasePackage

class BarCodeScannerPackage : BasePackage()

package expo.modules.barcodescanner

import android.content.Context
import expo.modules.core.interfaces.InternalModule
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ExportedModule
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import expo.modules.core.ViewManager

class BarCodeScannerPackage : Package {
  override fun createInternalModules(context: Context): List<InternalModule> = emptyList()
  override fun createExportedModules(context: Context): List<ExportedModule> = emptyList()
  override fun createViewManagers(context: Context): List<ViewManager<*, *>> = emptyList()
  override fun createReactActivityLifecycleListeners(context: Context): List<ReactActivityLifecycleListener> = emptyList()
}


