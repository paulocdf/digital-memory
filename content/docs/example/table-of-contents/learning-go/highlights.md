---
title: learning-go
weight: 1
---

Go Run -> Use go run when you want to treat a Go program like a script and run the source code immediately.
Go Build -> build a binary for later use

### Getting Third-Party Go Tools
Go’s method for publishing code is a bit different than most other languages. Go developers don’t rely on a centrally hosted service, like Maven Central for Java or the NPM registry for JavaScript. Instead, they share projects via their source code repositories. The go install command takes an argument, which is the location of the source code repository of the project you want to install, followed by an @ and the version of the tool you want (if you just want to get the latest version, use @latest).

### Formatting your code
One of the chief design goals for Go was to create a language that allowed you to write code efficiently. This meant having simple syntax and a fast compiler. It also led Go’s authors to reconsider code formatting. Most languages allow a great deal of flexibility on how code is laid out. Go does not.
Since Go defines a standard way of formatting code, Go developers avoid arguments over One True Brace Style and Tabs vs. Spaces, For example, Go programs use tabs to indent, and it is a syntax error if the opening brace is not on the same line as the declaration or command that begins the block.

```
#Format
go fmt

# Enhanced format (sometimes wrong)
goimports

# Usage
goimports -l -w .
```

THE SEMICOLON INSERTION RULE
The go fmt command won’t fix braces on the wrong line, because of the semicolon insertion rule. Like C or Java, Go requires a semicolon at the end of every statement. However, Go developers never put the semicolons in themselves;
The semicolon insertion rule is one of the things that makes the Go compiler simpler and faster, while at the same time enforcing a coding style. That’s clever.

Wrong usage of brace leads to this:
```
func main();
{
    fmt.Println("Hello, world!");
};
```

`golangci-lint` -> enforce style

There is another class of errors that developers run into. The code is syntactically valid, but there are mistakes that are not what you meant to do. This includes things like passing the wrong number of parameters to formatting methods or assigning values to variables that are never used. The go tool includes a command called go vet to detect these kinds of errors.


### Chapter 2. Primitive Types and Declarations

Literals are untyped because Go is a practical language. It makes sense to avoid forcing a type until the developer specifies one. There are size limitations; while you can write numeric literals that are larger than any integer can hold, it is a compile-time error to try to assign a literal whose value overflows the specified variable, such as trying to assign the literal 1000 to a variable of type byte.



 Go doesn’t provide a way to specify that a value calculated at runtime is immutable. As we’ll see in the next chapter, there are no immutable arrays, slices, maps, or structs, and there’s no way to declare that a field in a struct is immutable. This is less limiting than it sounds. Within a function, it is clear if a variable is being modified, so immutability is less important. In “Go Is Call By Value”, we’ll see how Go prevents modifications to variables that are passed as parameters to functions.


Here’s what an untyped constant declaration looks like:

const x = 10
All of the following assignments are legal:

var y int = x
var z float64 = x
var d byte = x
Here’s what a typed constant declaration looks like:

const typedX int = 10

There are additional third-party tools to check code style and scan for potential bugs. However, running multiple tools over your code slows down the build because each tool spends time scanning the source code for itself. Rather than use separate tools, you can run multiple tools together with golangci-lint.


### Chapter 3. Composite Types


Earlier I said that arrays in Go are rarely used explicitly. This is because they come with an unusual limitation: Go considers the size of the array to be part of the type of the array. This makes an array that’s declared to be [3]int a different type from an array that’s declared to be [4]int. This also means that you cannot use a variable to specify the size of an array, because types must be resolved at compile time, not at runtime.
This raises the question: why is such a limited feature in the language? The main reason why arrays exist in Go is to provide the backing store for slices, which are one of the most useful features of Go.

### Slices
Working with slices looks quite a bit like working with arrays, but there are subtle differences. The first thing to notice is that we don’t specify the size of the slice when we declare it:

var x = []int{10, 20, 30}


Tip: Using […] makes an array. Using [] makes a slice.


The Go runtime is compiled into every Go binary. This is different from languages that use a virtual machine, which must be installed separately to allow programs written in those languages to function. Including the runtime in the binary makes it easier to distribute Go programs and avoids worries about compatibility issues between the runtime and the program.

Structs

If you already know an object-oriented language, you might be wondering about the difference between classes and structs. The difference is simple: Go doesn’t have classes, because it doesn’t have inheritance. This doesn’t mean that Go doesn’t have some of the features of object-oriented languages, it just does things a little differently. We’ll learn more about the object-oriented features of Go in Chapter 7.

Closures
Functions declared inside of functions are special; they are closures. This is a computer science word that means that functions declared inside of functions are able to access and modify variables declared in the outer function.




