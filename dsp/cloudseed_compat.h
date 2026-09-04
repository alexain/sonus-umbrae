#pragma once

#include <cstddef>
#include <cstring>

// CloudSeedCore is portable C++14, but its parameter-formatting helper uses
// Microsoft's strcpy_s.  Emscripten does not provide that CRT extension.
inline int su_cloudseed_strcpy_s(char* destination, std::size_t destinationSize, const char* source) {
  if (!destination || destinationSize == 0) return 22;
  if (!source) {
    destination[0] = '\0';
    return 22;
  }
  const std::size_t length = std::strlen(source);
  if (length + 1 > destinationSize) {
    destination[0] = '\0';
    return 34;
  }
  std::memcpy(destination, source, length + 1);
  return 0;
}

#ifndef _MSC_VER
#define strcpy_s su_cloudseed_strcpy_s
#endif
