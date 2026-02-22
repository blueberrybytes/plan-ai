import Foundation
import ScreenCaptureKit
import AVFoundation

class AudioRecorder: NSObject, SCStreamOutput {
    var stream: SCStream?
    var fileWriter: AVAssetWriter?
    var audioInput: AVAssetWriterInput?
    var isWritingError = false
    var isStarted = false
    var sessionStarted = false

    func startRecording(to filePath: String) {
        let outputURL = URL(fileURLWithPath: filePath)
        do {
            if FileManager.default.fileExists(atPath: outputURL.path) {
                try FileManager.default.removeItem(at: outputURL)
            }
            fileWriter = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
            
            let audioSettings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 128000
            ]
            audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            audioInput?.expectsMediaDataInRealTime = true
            
            if fileWriter!.canAdd(audioInput!) {
                fileWriter!.add(audioInput!)
            } else {
                print("Failed to add audio input")
                exit(1)
            }
        } catch {
            print("Failed to setup AVAssetWriter: \(error.localizedDescription)")
            exit(1)
        }
        
        SCShareableContent.getWithCompletionHandler { [weak self] content, error in
            guard let self = self else { return }
            
            if let error = error {
                print("Error getting shareable content: \(error.localizedDescription)")
                exit(1)
            }
            
            guard let display = content?.displays.first else {
                print("No displays found")
                exit(1)
            }
            
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            let config = SCStreamConfiguration()
            config.capturesAudio = true
            config.excludesCurrentProcessAudio = true // Prevent echoing the app's own sounds
            config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
            
            do {
                self.stream = SCStream(filter: filter, configuration: config, delegate: nil)
                try self.stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio.queue"))
                self.stream?.startCapture { error in
                    if let error = error {
                        print("Failed to start capture: \(error.localizedDescription)")
                        exit(1)
                    }
                    print("Started capturing audio to \(filePath)")
                    self.isStarted = true
                }
            } catch {
                print("Error setting up SCStream: \(error.localizedDescription)")
                exit(1)
            }
        }
    }
    
    func stopRecording() {
        print("Stopping recording...")
        stream?.stopCapture { _ in }
        
        if fileWriter?.status == .writing {
            audioInput?.markAsFinished()
            fileWriter?.finishWriting {
                print("Finished writing file")
                exit(0)
            }
        } else {
            print("Finished writing file (no data or unknown status)")
            exit(0)
        }
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, let input = audioInput else { return }
        if self.isStarted {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                
                if self.fileWriter?.status == .unknown {
                    if self.fileWriter?.startWriting() == true {
                        self.fileWriter?.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
                        self.sessionStarted = true
                    } else {
                        print("Error starting file writer")
                        return
                    }
                }
                
                if self.fileWriter?.status == .writing && self.sessionStarted {
                    if input.isReadyForMoreMediaData {
                        let success = input.append(sampleBuffer)
                        if !success && !self.isWritingError {
                            self.isWritingError = true
                            print("Error appending sample buffer: \(String(describing: self.fileWriter?.error))")
                        }
                    }
                }
            }
        }
    }
}

let args = CommandLine.arguments
if args.count < 2 {
    print("Usage: macos-audio-capture <output_file_path>")
    exit(1)
}

let outputPath = args[1]
let recorder = AudioRecorder()

// Set up signal handlers gracefully
let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigIntSource.setEventHandler {
    print("Received SIGINT")
    recorder.stopRecording()
}
sigIntSource.resume()
signal(SIGINT, SIG_IGN)

let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigTermSource.setEventHandler {
    print("Received SIGTERM")
    recorder.stopRecording()
}
sigTermSource.resume()
signal(SIGTERM, SIG_IGN)

recorder.startRecording(to: outputPath)

// Block main thread and listen for signals/events
RunLoop.main.run()
