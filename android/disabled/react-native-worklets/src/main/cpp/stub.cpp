#include <string>
#include <memory>

// Forward declarations to avoid depending on ReactAndroid headers
namespace facebook {
namespace jsi {
class Runtime;
class Value;
} // namespace jsi
} // namespace facebook

namespace worklets {

// Minimal placeholder type to satisfy templated usage in Reanimated
struct SerializableWorklet {};
struct SerializableObject; // forward declaration only

// stringify helper used by Reanimated error messages
std::string stringifyJSIValue(facebook::jsi::Runtime&, const facebook::jsi::Value&) {
  return std::string("<value>");
}

// Generic template declaration (Reanimated expects shared_ptr<T>)
template <typename T>
std::shared_ptr<T> extractSerializableOrThrow(
    facebook::jsi::Runtime&,
    const facebook::jsi::Value&,
    const std::string&) {
  return std::shared_ptr<T>();
}

// Define SerializableObject as an empty placeholder
struct SerializableObject {};

// Explicit specialization returning shared_ptr<SerializableWorklet>
template <>
std::shared_ptr<SerializableWorklet> extractSerializableOrThrow<SerializableWorklet>(
    facebook::jsi::Runtime&,
    const facebook::jsi::Value&,
    const std::string&) {
  return std::make_shared<SerializableWorklet>();
}

// Specialization returning shared_ptr<SerializableObject>
template <>
std::shared_ptr<SerializableObject> extractSerializableOrThrow<SerializableObject>(
    facebook::jsi::Runtime&,
    const facebook::jsi::Value&,
    const std::string&) {
  return std::make_shared<SerializableObject>();
}

} // namespace worklets


