import CoreAudio
import Foundation

func getDeviceIsRunning(deviceID: AudioDeviceID) -> Bool {
    var isRunning: UInt32 = 0
    var propertySize = UInt32(MemoryLayout<UInt32>.size)
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )

    let status = AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &propertySize,
        &isRunning
    )

    return status == noErr && isRunning != 0
}

func getDeviceName(deviceID: AudioDeviceID) -> String {
    var name: CFString = "" as CFString
    var propertySize = UInt32(MemoryLayout<CFString>.size)
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioObjectPropertyName,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    
    var nameCFString: Unmanaged<CFString>?
    let status = AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &propertySize,
        &nameCFString
    )
    
    if status == noErr, let cfString = nameCFString?.takeUnretainedValue() {
        return cfString as String
    }
    return "Unknown Device (ID: \(deviceID))"
}

func deviceHasInputFrames(deviceID: AudioDeviceID) -> Bool {
    var propertySize: UInt32 = 0
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreamConfiguration,
        mScope: kAudioDevicePropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    
    var status = AudioObjectGetPropertyDataSize(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &propertySize
    )
    
    if status != noErr || propertySize == 0 {
        return false
    }
    
    let bufferListPointer = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: Int(propertySize))
    defer { bufferListPointer.deallocate() }
    
    status = AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &propertySize,
        bufferListPointer
    )
    
    if status == noErr {
        let buffers = UnsafeMutableAudioBufferListPointer(bufferListPointer)
        for buffer in buffers {
            if buffer.mNumberChannels > 0 {
                return true
            }
        }
    }
    return false
}

func getAllDevices() -> [AudioDeviceID] {
    var propertySize: UInt32 = 0
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    
    var status = AudioObjectGetPropertyDataSize(
        AudioObjectID(kAudioObjectSystemObject),
        &propertyAddress,
        0,
        nil,
        &propertySize
    )
    
    if status != noErr {
        return []
    }
    
    let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
    
    status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &propertyAddress,
        0,
        nil,
        &propertySize,
        &deviceIDs
    )
    
    if status == noErr {
        return deviceIDs
    }
    return []
}

func getDefaultInputDevice() -> AudioDeviceID? {
    var deviceID = kAudioObjectUnknown
    var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )

    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &propertyAddress,
        0,
        nil,
        &propertySize,
        &deviceID
    )

    if status == noErr && deviceID != kAudioObjectUnknown {
        return deviceID
    }
    return nil
}

var isAnyMicActive = false
var activeDevices: [String] = []
var allDevicesList: [String] = []

let allDevices = getAllDevices()

for deviceID in allDevices {
    let name = getDeviceName(deviceID: deviceID)
    let isDefaultInput = deviceID == getDefaultInputDevice()
    let hasInput = deviceHasInputFrames(deviceID: deviceID)
    let isRunning = getDeviceIsRunning(deviceID: deviceID)

    let deviceInfo = "{ \"id\": \(deviceID), \"name\": \"\(name)\", \"isDefaultInput\": \(isDefaultInput), \"hasInput\": \(hasInput), \"isRunning\": \(isRunning) }"
    allDevicesList.append(deviceInfo)

    if hasInput && isRunning {
        isAnyMicActive = true
        activeDevices.append("\"\(name)\"")
    }
}

let activeDevicesJson = "[\(activeDevices.joined(separator: ", "))]"
let allDevicesJson = "[\(allDevicesList.joined(separator: ", "))]"

print("{\"isActive\": \(isAnyMicActive), \"activeDevices\": \(activeDevicesJson), \"allDevices\": \(allDevicesJson)}")
