// Crops the top or bottom band of a screenshot (CI 边缘特写): swift crop-edge.swift <in.png> <out.png> <top|bottom> <height>
import Foundation
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count == 5, let band = Int(a[4]),
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { print("usage: crop-edge in out top|bottom height"); exit(1) }
let h = min(band, image.height), y = a[3] == "bottom" ? image.height - h : 0
guard let cut = image.cropping(to: CGRect(x: 0, y: y, width: image.width, height: h)),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, cut, nil)
exit(CGImageDestinationFinalize(dest) ? 0 : 1)
