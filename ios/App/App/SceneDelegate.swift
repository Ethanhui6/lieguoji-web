import UIKit
import Capacitor

/// Full-screen web view. prefersHomeIndicatorAutoHidden is public, not open, so it
/// cannot be overridden. The status bar stays visible (Info.plist) and this publishes
/// the real safe-area insets for CSS when env(safe-area-inset-*) is 0.
class GameViewController: CAPBridgeViewController {
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let insets = view.safeAreaInsets
        let js = """
        (function(){
          var de=document.documentElement; if(!de) return;
          de.style.setProperty('--sat','\(insets.top)px');
          de.style.setProperty('--sab','\(insets.bottom)px');
          de.style.setProperty('--sal','\(insets.left)px');
          de.style.setProperty('--sar','\(insets.right)px');
        })();
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = UIColor(red: 16.0 / 255.0, green: 43.0 / 255.0, blue: 59.0 / 255.0, alpha: 1)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
