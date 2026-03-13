cmake_minimum_required(VERSION 3.10)
project(worklets LANGUAGES C CXX)

add_library(worklets SHARED
  src/main/cpp/stub.c
  src/main/cpp/stub.cpp
)

target_include_directories(worklets PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp
)

target_compile_definitions(worklets PRIVATE
  RN_WORKLETS_DISABLED=1
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)


