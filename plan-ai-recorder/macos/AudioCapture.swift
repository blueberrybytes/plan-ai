import Foundation
import ScreenCaptureKit
import AVFoundation

func flushedPrint(_ items: Any..., separator: String = " ", terminator: String = "\n") {
    Swift.print(items.map { "\($0)" }.joined(separator: separator), terminator: terminator)
    fflush(stdout)
}

class AudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        flushedPrint("SCStream suddenly stopped with error: \(error.localizedDescription)")
    }
    var stream: SCStream?
    var fileWriter: AVAssetWriter?
    var audioInput: AVAssetWriterInput?
    var isWritingError = false
    var isStarted = false
    var sessionStarted = false

    var fileIndex: Int = 0
    var basePath: String = ""
    let writerQueue = DispatchQueue(label: "audio.writer.queue")
    let streamQueue = DispatchQueue(label: "audio.stream.queue", qos: .userInteractive)
    
    func startRecording(basePath: String) {
        self.basePath = basePath
        self.setupNewWriter(isInitial: true)
        
        SCShareableContent.getWithCompletionHandler { [weak self] content, error in
            guard let self = self else { return }
            
            if let error = error {
                flushedPrint("Error getting shareable content: \(error.localizedDescription)")
                exit(1)
            }
            
            guard let display = content?.displays.first else {
                flushedPrint("No displays found")
                exit(1)
            }
            
            DispatchQueue.main.async {
                let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
                let config = SCStreamConfiguration()
                config.capturesAudio = true
                
                do {
                    self.stream = SCStream(filter: filter, configuration: config, delegate: self)
                    flushedPrint("SCStream initialized. Adding output delegate...")
                    try self.stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: self.streamQueue)
                    
                    flushedPrint("Calling startCapture...")
                    self.stream?.startCapture { error in
                        if let error = error {
                            flushedPrint("Failed to start capture: \(error.localizedDescription)")
                            exit(1)
                        }
                        flushedPrint("Started capturing system audio to base path: \(basePath)")
                        self.isStarted = true
                    }
                    flushedPrint("startCapture dispatched.")
                } catch {
                    flushedPrint("Error setting up SCStream: \(error.localizedDescription)")
                    exit(1)
                }
            }
        }
    }
    
    func setupNewWriter(isInitial: Bool) {
        writerQueue.async {
            self.fileIndex += 1
            let currentPath = "\(self.basePath)_\(self.fileIndex).m4a"
            let outputURL = URL(fileURLWithPath: currentPath)
            
            do {
                if FileManager.default.fileExists(atPath: outputURL.path) {
                    try FileManager.default.removeItem(at: outputURL)
                }
                
                let newWriter = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
                let audioSettings: [String: Any] = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 48000,
                    AVNumberOfChannelsKey: 2,
                    AVEncoderBitRateKey: 128000
                ]
                let newInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
                newInput.expectsMediaDataInRealTime = true
                
                if newWriter.canAdd(newInput) {
                    newWriter.add(newInput)
                } else {
                    flushedPrint("Failed to add audio input to writer")
                    exit(1)
                }
                
                let oldWriter = self.fileWriter
                let oldInput = self.audioInput
                let prevIndex = self.fileIndex - 1
                let oldPath = "\(self.basePath)_\(prevIndex).m4a"
                
                self.fileWriter = newWriter
                self.audioInput = newInput
                self.sessionStarted = false
                
                if !isInitial {
                    if oldWriter?.status == .writing {
                        oldInput?.markAsFinished()
                        oldWriter?.finishWriting {
                            flushedPrint("CHUNK_READY:\(oldPath)")
                        }
                    } else {
                        flushedPrint("CHUNK_READY:\(oldPath)")
                    }
                }
            } catch {
                flushedPrint("Failed to setup AVAssetWriter: \(error.localizedDescription)")
                exit(1)
            }
        }
    }
    
    func rotateChunk() {
        self.setupNewWriter(isInitial: false)
    }
    
    func stopRecording() {
        flushedPrint("Stopping recording...")
        writerQueue.async {
            self.stream?.stopCapture { _ in }
            let finalPath = "\(self.basePath)_\(self.fileIndex).m4a"
            
            if self.fileWriter?.status == .writing {
                self.audioInput?.markAsFinished()
                self.fileWriter?.finishWriting {
                    flushedPrint("CHUNK_READY:\(finalPath)")
                    flushedPrint("Finished system audio capture.")
                    exit(0)
                }
            } else {
                flushedPrint("CHUNK_READY:\(finalPath)")
                flushedPrint("Finished system audio capture (no data).")
                exit(0)
            }
        }
    }
    
    var packetCount = 0

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        packetCount += 1
        if packetCount % 100 == 1 {
           flushedPrint("Received audio packet #\(packetCount). type=\(type.rawValue), isStarted=\(self.isStarted)")
        }

        guard type == .audio else { return }
        
        // We must offload the buffer processing to the writer queue, so SCStream is NEVER blocked!
        writerQueue.async { [weak self] in
            guard let self = self else { return }
            guard let input = self.audioInput else {
                if self.packetCount % 100 == 1 { flushedPrint("Dropped packet: audioInput is null") }
                return
            }
            
            if self.fileWriter?.status == .unknown {
                if self.fileWriter?.startWriting() == true {
                    self.fileWriter?.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
                    self.sessionStarted = true
                } else {
                    flushedPrint("Error starting file writer session")
                    return
                }
            }
            
            if self.fileWriter?.status == .writing && self.sessionStarted {
                if input.isReadyForMoreMediaData {
                    let success = input.append(sampleBuffer)
                    if !success && !self.isWritingError {
                        self.isWritingError = true
                        flushedPrint("Error appending sample buffer: \(String(describing: self.fileWriter?.error))")
                    } else if self.packetCount == 1 {
                        flushedPrint("Successfully appended FIRST sample buffer.")
                    }
                }
            }
        }
    }
}

let args = CommandLine.arguments
if args.count < 2 {
    flushedPrint("Usage: macos-audio-capture <base_output_path>")
    exit(1)
}

let basePath = args[1]
let recorder = AudioRecorder()

// Set up signal handlers gracefully
let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigIntSource.setEventHandler {
    recorder.stopRecording()
}
sigIntSource.resume()
signal(SIGINT, SIG_IGN)

let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigTermSource.setEventHandler {
    recorder.stopRecording()
}
sigTermSource.resume()
signal(SIGTERM, SIG_IGN)

// Rotate chunk exactly on SIGUSR1
let sigUsr1Source = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
sigUsr1Source.setEventHandler {
    recorder.rotateChunk()
}
sigUsr1Source.resume()
signal(SIGUSR1, SIG_IGN)

recorder.startRecording(basePath: basePath)

// Block main thread and listen for signals/events
RunLoop.main.run()
